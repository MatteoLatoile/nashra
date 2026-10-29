import { NextRequest, NextResponse } from 'next/server';
import { noStore, session } from '@/lib/nashra-bundle/secure';
import { billingMode, configuredPrice, stripeGet, type PaidTier, type BillingInterval } from '@/lib/nashra-bundle/stripe';
import { getEffectivePlan } from '@/lib/billing/quotas-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CheckoutResult = {
  state: 'waiting' | 'processing' | 'active' | 'needs_attention';
  tier?: PaidTier;
  interval?: BillingInterval;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export async function GET(req: NextRequest) {
  const signedIn = await session();
  if (!signedIn) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401, headers: noStore });
  const mode = billingMode();
  if (mode === 'disabled') return NextResponse.json({ error: 'Facturation indisponible.' }, { status: 503, headers: noStore });

  const id = req.nextUrl.searchParams.get('session_id') || '';
  // Don't accept arbitrary paths or inject a different Stripe object ID into our API call.
  if (!/^cs_(test_|live_)[A-Za-z0-9]{8,}$/.test(id) || id.length > 180) {
    return NextResponse.json({ error: 'Session de paiement invalide.' }, { status: 400, headers: noStore });
  }
  if (!id.startsWith(mode === 'live' ? 'cs_live_' : 'cs_test_')) {
    return NextResponse.json({ error: 'Environnement de paiement incorrect.' }, { status: 400, headers: noStore });
  }

  try {
    // This never grants an entitlement. Only the signed webhook does so in SQL 019.
    const checkout = await stripeGet(`checkout/sessions/${id}`);
    if (checkout.id !== id || checkout.mode !== 'subscription' || checkout.livemode !== (mode === 'live')
      || checkout.client_reference_id !== signedIn.user.id) {
      return NextResponse.json({ error: 'Ce paiement ne correspond pas à votre compte.' }, { status: 403, headers: noStore });
    }
    const metadata = isObject(checkout.metadata) ? checkout.metadata : {};
    const tier = metadata.nashra_plan;
    const interval = metadata.nashra_interval;
    if ((tier !== 'pro' && tier !== 'business') || (interval !== 'month' && interval !== 'year')
      || metadata.nashra_user_id !== signedIn.user.id) {
      return NextResponse.json({ error: 'Offre non reconnue.' }, { status: 400, headers: noStore });
    }
    if (checkout.status === 'expired') {
      return NextResponse.json({ state: 'needs_attention', tier, interval } satisfies CheckoutResult, { headers: noStore });
    }
    const subscriptionId = checkout.subscription;
    if (typeof subscriptionId !== 'string' || !/^sub_[A-Za-z0-9]+$/.test(subscriptionId)) {
      // Stripe has not created a subscription yet (e.g. an open Checkout Session).
      return NextResponse.json({ state: 'waiting', tier, interval } satisfies CheckoutResult, { headers: noStore });
    }

    if (checkout.status !== 'complete') {
      return NextResponse.json({ state: 'waiting', tier, interval } satisfies CheckoutResult, { headers: noStore });
    }
    // Asynchronous payment methods can redirect before the charge is settled.
    if (checkout.payment_status !== 'paid' && checkout.payment_status !== 'no_payment_required') {
      return NextResponse.json({ state: 'processing', tier, interval } satisfies CheckoutResult, { headers: noStore });
    }

    // Payment completion can precede webhook delivery. Do not display "activated" until
    // the DB subscription and its effective tier BOTH confirm the expected purchase.
    const { data: subscription, error: subscriptionError } = await signedIn.db
      .from('nashra_subscriptions')
      .select('stripe_subscription_id,stripe_customer_id,stripe_livemode,price_id,status,current_period_end,cancel_at_period_end')
      .eq('user_id', signedIn.user.id).maybeSingle();
    if (subscriptionError) throw subscriptionError;

    const expectedPrice = configuredPrice(tier, interval);
    const expiry = subscription?.current_period_end ? Date.parse(subscription.current_period_end) : NaN;
    const linked = subscription?.stripe_subscription_id === subscriptionId
      && subscription?.stripe_livemode === (mode === 'live')
      && typeof checkout.customer === 'string' && subscription?.stripe_customer_id === checkout.customer;
    const activeInDb = linked && expectedPrice !== null && subscription?.price_id === expectedPrice
      && (subscription.status === 'active' || subscription.status === 'trialing')
      && Number.isFinite(expiry) && expiry > Date.now();

    // The actual per-user quotas must be effective, not merely a paid Stripe status.
    if (activeInDb && (await getEffectivePlan(signedIn.user.id)).plan_slug === tier) {
      return NextResponse.json({ state: 'active', tier, interval,
        currentPeriodEnd: subscription!.current_period_end,
        cancelAtPeriodEnd: subscription!.cancel_at_period_end === true,
      } satisfies CheckoutResult, { headers: noStore });
    }
    if (linked && ['canceled','unpaid','incomplete_expired','paused'].includes(subscription?.status || '')) {
      return NextResponse.json({ state: 'needs_attention', tier, interval } satisfies CheckoutResult, { headers: noStore });
    }
    return NextResponse.json({ state: 'processing', tier, interval } satisfies CheckoutResult, { headers: noStore });
  } catch {
    return NextResponse.json({ error: 'Vérification temporairement indisponible.' }, { status: 502, headers: noStore });
  }
}
