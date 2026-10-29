import { NextRequest, NextResponse } from 'next/server';
import { adminDb, noStore } from '@/lib/nashra-bundle/secure';
import { billingMode, configuredPrice, stripeGet, verifyStripeSignature, type BillingInterval, type PaidTier } from '@/lib/nashra-bundle/stripe';
import { tierFromVerifiedSubscription } from '@/lib/billing/entitlements';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type StripeObject = Record<string, unknown>;
type StripeEvent = { id: string; type: string; created: number; livemode: boolean;
  data: { object: StripeObject } };

const subscriptionTypes = new Set([
  'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted',
  'customer.subscription.paused', 'customer.subscription.resumed',
  'customer.subscription.pending_update_applied',
]);
const supportedTypes = new Set([
  ...subscriptionTypes, 'checkout.session.completed', 'checkout.session.async_payment_succeeded',
  'invoice.paid', 'invoice.payment_failed',
]);
const allowedStatuses = new Set([
  'incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused',
]);
function stringOf(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
function timestamp(value: unknown): string | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? new Date(value * 1000).toISOString() : null;
}
function nested(value: unknown): StripeObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as StripeObject : {};
}
/** Supports old and Basil+ invoice shapes. Ignore unrelated, non-subscription invoices. */
function subscriptionId(event: StripeEvent): string | null {
  const obj = event.data.object;
  if (subscriptionTypes.has(event.type)) return stringOf(obj.id);
  if (event.type.startsWith('checkout.')) {
    if (obj.mode !== 'subscription') return null;
    return stringOf(obj.subscription);
  }
  const details = nested(nested(obj.parent).subscription_details);
  return stringOf(details.subscription) || stringOf(obj.subscription);
}
function intervalFromPrice(price: string | null): BillingInterval | null {
  if (!price) return null;
  for (const tier of ['pro', 'business'] as PaidTier[]) {
    if (configuredPrice(tier, 'month') === price) return 'month';
    if (configuredPrice(tier, 'year') === price) return 'year';
  }
  return null;
}

export async function POST(req: NextRequest) {
  const mode = billingMode();
  if (mode === 'disabled') return NextResponse.json({ error: 'Facturation désactivée.' }, { status: 503, headers: noStore });
  const raw = await req.text();
  if (raw.length > 1_000_000) return NextResponse.json({ error: 'Payload trop volumineux.' }, { status: 413, headers: noStore });
  if (!verifyStripeSignature(raw, req.headers.get('stripe-signature') || '', process.env.STRIPE_WEBHOOK_SECRET || ''))
    return NextResponse.json({ error: 'Signature Stripe invalide.' }, { status: 400, headers: noStore });

  let event: StripeEvent;
  try { event = JSON.parse(raw) as StripeEvent; }
  catch { return NextResponse.json({ error: 'Payload invalide.' }, { status: 400, headers: noStore }); }
  if (!event || !/^evt_[a-zA-Z0-9]+$/.test(event.id || '')
      || event.livemode !== (mode === 'live') || !event.data?.object
      || typeof event.created !== 'number' || !Number.isSafeInteger(event.created) || event.created <= 0)
    return NextResponse.json({ error: 'Événement ou environnement Stripe inattendu.' }, { status: 400, headers: noStore });
  if (!supportedTypes.has(event.type)) return NextResponse.json({ received: true, ignored: true }, { headers: noStore });

  const identifier = subscriptionId(event);
  if (!identifier) return NextResponse.json({ received: true, ignored: true }, { headers: noStore });
  if (!/^sub_[a-zA-Z0-9]+$/.test(identifier))
    return NextResponse.json({ error: 'Abonnement Stripe invalide.' }, { status: 400, headers: noStore });

  try {
    // Always retrieve CURRENT Stripe state: late/out-of-order webhooks must not restore stale rights.
    const obj = await stripeGet(`subscriptions/${identifier}`);
    const meta = nested(obj.metadata);
    let uid = stringOf(meta.nashra_user_id);
    const customer = stringOf(obj.customer);
    // If Stripe created a replacement subscription from an already linked customer,
    // recover ownership ONLY from the existing server-owned customer mapping.
    if (!uid && customer && /^cus_[a-zA-Z0-9]+$/.test(customer)) {
      const { data: owner, error: ownerError } = await adminDb()
        .from('nashra_subscriptions')
        .select('user_id')
        .eq('stripe_customer_id', customer)
        .eq('stripe_livemode', mode === 'live')
        .maybeSingle();
      if (ownerError) throw ownerError;
      uid = stringOf(owner?.user_id);
    }
    const status = stringOf(obj.status);
    if (!uid || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uid)
        || !customer || !/^cus_[a-zA-Z0-9]+$/.test(customer)
        || obj.id !== identifier || !status || !allowedStatuses.has(status)
        || obj.livemode !== (mode === 'live')
        || typeof obj.created !== 'number' || !Number.isSafeInteger(obj.created) || obj.created <= 0)
      return NextResponse.json({ error: 'Abonnement Stripe non reconnu.' }, { status: 400, headers: noStore });

    const items = nested(obj.items).data;
    const first = Array.isArray(items) ? nested(items[0]) : {};
    // The Nashra subscription must have exactly one recurring price, quantity 1.
    if (!Array.isArray(items) || items.length > 1 || (items.length === 1 && first.quantity !== 1))
      throw new Error('Nombre de lignes Stripe inattendu.');
    if (['active','trialing'].includes(status) && items.length !== 1)
      throw new Error('Aucune ligne de facturation pour un abonnement actif.');
    const priceId = stringOf(nested(first.price).id);
    const periodEnd = timestamp(first.current_period_end) || timestamp(obj.current_period_end);
    const periodStart = timestamp(first.current_period_start) || timestamp(obj.current_period_start);
    if (['active','trialing'].includes(status) && !periodEnd)
      throw new Error('Échéance Stripe absente.');

    const tier = tierFromVerifiedSubscription(status, priceId);
    const interval = intervalFromPrice(priceId);
    const db = adminDb();
    const { error } = await db.rpc('nashra_apply_subscription_event_v2', {
      p_event_id: event.id, p_event_type: event.type, p_event_created: event.created,
      p_user_id: uid, p_customer_id: customer, p_subscription_id: identifier,
      p_subscription_created: obj.created, p_price_id: priceId,
      p_status: status, p_livemode: mode === 'live',
      p_period_start: periodStart, p_period_end: periodEnd,
      p_cancel_at_period_end: obj.cancel_at_period_end === true,
      p_tier: tier, p_interval: interval,
    });
    if (error) throw error;
    return NextResponse.json({ received: true }, { headers: noStore });
  } catch {
    // Retry on transient Stripe or DB errors. Never unlock a paid plan on a redirect alone.
    return NextResponse.json({ error: 'Synchronisation impossible ; Stripe réessaiera.' }, { status: 500, headers: noStore });
  }
}
