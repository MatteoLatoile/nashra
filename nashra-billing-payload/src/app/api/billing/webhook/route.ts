import { NextRequest, NextResponse } from 'next/server';
import { adminDb, noStore } from '@/lib/nashra-bundle/secure';
import { billingMode, stripeGet, verifyStripeSignature } from '@/lib/nashra-bundle/stripe';
import { tierFromVerifiedSubscription } from '@/lib/billing/entitlements';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type StripeEvent = { id: string; type: string; created: number; livemode: boolean;
  data: { object: Record<string, unknown> } };
const allowedTypes = new Set(['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted']);
const allowedStatuses = new Set(['incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused']);
function str(v: unknown): string | null { return typeof v === 'string' && v.length > 0 ? v : null; }
function time(v: unknown) {
  return typeof v === 'number' && Number.isSafeInteger(v) && v > 0 ? new Date(v * 1000).toISOString() : null;
}

export async function POST(req: NextRequest) {
  const mode = billingMode();
  if (mode === 'disabled') return NextResponse.json({ error: 'Facturation désactivée.' }, { status: 503, headers: noStore });
  const raw = await req.text();
  const secret = process.env.STRIPE_WEBHOOK_SECRET || '';
  if (!verifyStripeSignature(raw, req.headers.get('stripe-signature') || '', secret))
    return NextResponse.json({ error: 'Signature Stripe invalide.' }, { status: 400, headers: noStore });
  let event: StripeEvent;
  try { event = JSON.parse(raw) as StripeEvent; }
  catch { return NextResponse.json({ error: 'Payload invalide.' }, { status: 400, headers: noStore }); }
  if (!event || !/^evt_[a-zA-Z0-9]+$/.test(event.id || '') || event.livemode !== (mode === 'live') ||
      !event.data?.object || typeof event.created !== 'number' || !Number.isSafeInteger(event.created))
    return NextResponse.json({ error: 'Événement ou environnement Stripe inattendu.' }, { status: 400, headers: noStore });
  if (!allowedTypes.has(event.type)) return NextResponse.json({ received: true, ignored: true }, { headers: noStore });
  const identifier = str(event.data.object.id);
  if (!identifier || !/^sub_[a-zA-Z0-9]+$/.test(identifier))
    return NextResponse.json({ error: 'Identifiant d’abonnement invalide.' }, { status: 400, headers: noStore });
  try {
    // Retrieve the CURRENT subscription so an out-of-order or delayed webhook
    // cannot reinstate an old plan or status. The database writes atomically.
    const obj = await stripeGet(`subscriptions/${identifier}`);
    const meta = obj.metadata as Record<string, unknown> | undefined;
    const uid = str(meta?.nashra_user_id);
    const customer = str(obj.customer);
    const status = str(obj.status);
    if (!uid || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(uid)
        || !customer?.startsWith('cus_') || obj.id !== identifier || !status || !allowedStatuses.has(status)
        || obj.livemode !== (mode === 'live'))
      return NextResponse.json({ error: 'Abonnement Stripe non reconnu.' }, { status: 400, headers: noStore });
    const items = obj.items as { data?: Array<{ price?: { id?: string }, current_period_end?: number }> } | undefined;
    const first = items?.data?.[0];
    const priceId = str(first?.price?.id);
    const periodEnd = time(obj.current_period_end) || time(first?.current_period_end);
    const tier = tierFromVerifiedSubscription(status, priceId);
    const db = adminDb();
    const { error: syncError } = await db.rpc('nashra_apply_subscription_event', {
      p_user_id: uid, p_customer_id: customer, p_subscription_id: identifier,
      p_price_id: priceId, p_status: status, p_livemode: mode === 'live',
      p_period_end: periodEnd, p_cancel_at_period_end: obj.cancel_at_period_end === true,
      p_event_created: event.created, p_subscription_created: typeof obj.created === 'number' ? obj.created : 0, p_tier: tier,
    });
    if (syncError) throw syncError;
    return NextResponse.json({ received: true }, { headers: noStore });
  } catch {
    // Non-2xx => Stripe retries. Never grant a tier when storage or verification failed.
    return NextResponse.json({ error: 'Synchronisation impossible ; Stripe réessaiera.' }, { status: 500, headers: noStore });
  }
}
