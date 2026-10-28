import { NextResponse } from 'next/server';
import { noStore, session } from '@/lib/nashra-bundle/secure';
import { billingMode, configuredPrice, stripeGet, type PaidTier } from '@/lib/nashra-bundle/stripe';
import { getQuotaSnapshot } from '@/lib/billing/quotas-server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PriceView = { available: boolean; amount: number | null; currency: string | null;
  interval: string | null; intervalCount: number };
async function priceView(tier: PaidTier): Promise<PriceView> {
  const price = configuredPrice(tier);
  if (!price) return { available: false, amount: null, currency: null, interval: null, intervalCount: 1 };
  try {
    const remote = await stripeGet(`prices/${price}`);
    const recurring = remote.recurring as { interval?: unknown; interval_count?: unknown } | undefined;
    const amount = typeof remote.unit_amount === 'number' && remote.unit_amount > 0 ? remote.unit_amount : null;
    const currency = typeof remote.currency === 'string' && /^[a-z]{3}$/.test(remote.currency) ? remote.currency : null;
    const interval = recurring && (recurring.interval === 'month' || recurring.interval === 'year') ? recurring.interval : null;
    const count = typeof recurring?.interval_count === 'number' && recurring.interval_count > 0 ? recurring.interval_count : 1;
    // Reject inactive/non-recurring prices; do not initiate checkout for them.
    if (remote.active !== true || !currency || amount === null || !interval || count !== 1)
      return { available: false, amount: null, currency: null, interval: null, intervalCount: 1 };
    return { available: true, amount, currency, interval, intervalCount: count };
  } catch { return { available: false, amount: null, currency: null, interval: null, intervalCount: 1 }; }
}

export async function GET() {
  const s = await session();
  if (!s) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401, headers: noStore });
  try {
  const [subscription, quotas, pro, business] = await Promise.all([
    s.db.from('nashra_subscriptions').select('status,price_id,current_period_end,cancel_at_period_end,stripe_customer_id,stripe_livemode')
      .eq('user_id', s.user.id).maybeSingle(),
    getQuotaSnapshot(s.user.id),
    priceView('pro'), priceView('business'),
  ]);
  if (subscription.error)
    return NextResponse.json({ error: 'Migrations SQL 004, 006, 009 et 014 requises.' }, { status: 503, headers: noStore });
  const mode = billingMode();
  const sub = subscription.data;
  const tier = quotas.tier;
  const used = quotas.usage.pendingSchedules.used;
  const limit = quotas.usage.pendingSchedules.limit;
  return NextResponse.json({
    enabled: mode !== 'disabled', billingMode: mode,
    tier, status: sub?.status || 'free', currentPeriodEnd: sub?.current_period_end || null,
    cancelAtPeriodEnd: sub?.cancel_at_period_end || false,
    hasCustomer: Boolean(mode !== 'disabled' && sub?.stripe_customer_id && sub.stripe_livemode === (mode === 'live')),
    limit, used, remaining: Math.max(0, limit - used),
    usage: quotas.usage, catalog: quotas.catalog,
    plans: { free: { available: true }, pro, business },
  }, { headers: noStore });
  } catch {
    return NextResponse.json({error:'Quotas indisponibles : vérifiez SQL 015 et 016.'},{status:503,headers:noStore});
  }
}
