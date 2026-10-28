import { NextRequest, NextResponse } from 'next/server';
import { adminDb, noStore } from '@/lib/nashra-bundle/secure';
import { verifyStripeSignature } from '@/lib/nashra-bundle/stripe';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type StripeEvent = { id: string; type: string; created: number; livemode: boolean;
  data: { object: Record<string, unknown> } };
function str(v: unknown): string | null { return typeof v === 'string' && v.length ? v : null; }
function period(sec: unknown): string | null {
  return typeof sec === 'number' && Number.isSafeInteger(sec) && sec > 0 ? new Date(sec * 1000).toISOString() : null;
}
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const secret = process.env.STRIPE_WEBHOOK_SECRET || '';
  if (!verifyStripeSignature(raw,req.headers.get('stripe-signature') || '',secret))
    return NextResponse.json({ error: 'Signature invalide.' }, { status: 400, headers: noStore });
  if (!process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') || process.env.NASHRA_BILLING_ENABLED !== '1')
    return NextResponse.json({ error: 'Webhook Stripe test désactivé.' }, { status: 503, headers: noStore });
  let event: StripeEvent;
  try { event = JSON.parse(raw) as StripeEvent; }
  catch { return NextResponse.json({ error: 'Payload invalide.' }, { status: 400, headers: noStore }); }
  if (event.livemode !== false || !event.data?.object || !event.id?.startsWith('evt_'))
    return NextResponse.json({ error: 'Événement Stripe inattendu.' }, { status: 400, headers: noStore });
  const obj = event.data.object;
  try {
    const db = adminDb();
    if (event.type === 'checkout.session.completed' && obj.mode === 'subscription') {
      const uid = str(obj.client_reference_id);
      const customer = str(obj.customer);
      const subscriptionId = str(obj.subscription);
      if (!uid || !/^[a-f0-9-]{36}$/i.test(uid) || !customer?.startsWith('cus_')) return NextResponse.json({ error: 'Référence utilisateur incorrecte.' }, { status: 400 });
      const { data: old, error: readError } = await db.from('nashra_subscriptions')
        .select('user_id').eq('user_id',uid).maybeSingle();
      if (readError) throw readError;
      if (old) {
        const { error } = await db.from('nashra_subscriptions').update({ stripe_customer_id: customer,
          stripe_subscription_id: subscriptionId, updated_at: new Date().toISOString() }).eq('user_id',uid);
        if (error) throw error;
      } else {
        const { error } = await db.from('nashra_subscriptions').insert({ user_id: uid,
          stripe_customer_id: customer, stripe_subscription_id: subscriptionId, status: 'incomplete' });
        if (error) throw error;
      }
    } else if (['customer.subscription.created','customer.subscription.updated','customer.subscription.deleted'].includes(event.type)) {
      const meta = obj.metadata as Record<string,unknown> | undefined;
      const uid = str(meta?.nashra_user_id);
      const customer = str(obj.customer), subscriptionId = str(obj.id);
      if (!uid || !/^[a-f0-9-]{36}$/i.test(uid) || !customer?.startsWith('cus_') || !subscriptionId?.startsWith('sub_'))
        return NextResponse.json({ error: 'Association abonné absente.' }, { status: 400, headers: noStore });
      const { data: old, error: readError } = await db.from('nashra_subscriptions')
        .select('last_event_created').eq('user_id',uid).maybeSingle();
      if (readError) throw readError;
      if (old && typeof old.last_event_created === 'number' && event.created < old.last_event_created)
        return NextResponse.json({ received: true, stale: true }, { headers: noStore });
      const items = obj.items as { data?: { price?: { id?: string } }[] } | undefined;
      const status = str(obj.status) || 'incomplete';
      const safeStatuses = ['incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused'];
      if (!safeStatuses.includes(status)) return NextResponse.json({ error: 'Statut inconnu.' }, { status: 400, headers: noStore });
      const { error } = await db.from('nashra_subscriptions').upsert({ user_id: uid,
        stripe_customer_id: customer, stripe_subscription_id: subscriptionId,
        price_id: str(items?.data?.[0]?.price?.id), status,
        current_period_end: period(obj.current_period_end),
        cancel_at_period_end: obj.cancel_at_period_end === true,
        last_event_created: event.created, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (error) throw error;
    }
    return NextResponse.json({ received: true }, { headers: noStore });
  } catch { return NextResponse.json({ error: 'Erreur de synchronisation du webhook ; Stripe peut réessayer.' }, { status: 500, headers: noStore }); }
}
