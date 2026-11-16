import { NextResponse } from 'next/server';
import { noStore, session } from '@/lib/nashra-bundle/secure';
import { billingMode, configuredPrice, stripeGet, validStripePrice, type BillingInterval, type PaidTier } from '@/lib/nashra-bundle/stripe';
import { getQuotaSnapshot } from '@/lib/billing/quotas-server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PriceView = { available: boolean; amount: number | null; currency: string | null;
  interval: string | null; intervalCount: number };
// Only cache verified public price metadata; checkout still validates real payments.
// Serverless cold starts may still need Stripe, but warm invocations avoid four API calls.
const priceCache = new Map<string, { until: number; result: PriceView }>();
const pendingPrices = new Map<string, Promise<PriceView>>();
const PRICE_CACHE_TTL = 5 * 60_000;

async function priceView(tier: PaidTier, interval: BillingInterval, expectedCents: number | null): Promise<PriceView> {
  const price = configuredPrice(tier, interval);
  const absent: PriceView = { available: false, amount: null, currency: null, interval: null, intervalCount: 1 };
  if (!price || expectedCents === null) return absent;
  const key = `${price}:${interval}:${expectedCents}`;
  const saved = priceCache.get(key);
  if (saved && saved.until > Date.now()) return saved.result;
  const existing = pendingPrices.get(key);
  if (existing) return existing;
  const pending = (async () => {
    try {
      const remote = await stripeGet(`prices/${price}`);
      const result: PriceView = remote.id === price && validStripePrice(remote, interval, expectedCents)
        ? { available: true, amount: expectedCents, currency: 'usd', interval, intervalCount: 1 } : absent;
      priceCache.set(key, { until: Date.now() + PRICE_CACHE_TTL, result });
      return result;
    } catch { return absent; }
  })();
  pendingPrices.set(key, pending);
  try { return await pending; }
  finally { if (pendingPrices.get(key) === pending) pendingPrices.delete(key); }
}

export async function GET() {
  const s = await session();
  if (!s) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401, headers: noStore });
  try {
  const [subscription, quotas] = await Promise.all([
    s.db.from('nashra_subscriptions').select('status,price_id,current_period_end,cancel_at_period_end,stripe_customer_id,stripe_livemode')
      .eq('user_id', s.user.id).maybeSingle(),
    getQuotaSnapshot(s.user.id),
  ]);
  if (subscription.error)
    return NextResponse.json({ error: 'Migrations SQL 004, 006, 009 et 014 requises.' }, { status: 503, headers: noStore });
  const planPrices = (tier: PaidTier) => quotas.catalog.find(x => x.slug === tier);
  const proPlan = planPrices('pro');
  const businessPlan = planPrices('business');
  const [proMonth, proYear, businessMonth, businessYear] = await Promise.all([
    priceView('pro','month', proPlan?.monthly_price_usd_cents ?? null),
    priceView('pro','year', proPlan?.annual_price_usd_cents ?? null),
    priceView('business','month', businessPlan?.monthly_price_usd_cents ?? null),
    priceView('business','year', businessPlan?.annual_price_usd_cents ?? null),
  ]);
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
    plans: { free: { available: true }, pro: {month:proMonth,year:proYear}, business: {month:businessMonth,year:businessYear} },
  }, { headers: noStore });
  } catch {
    return NextResponse.json({error:'Quotas indisponibles : vérifiez SQL 015 et 016.'},{status:503,headers:noStore});
  }
}
