import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

export type BillingMode = 'disabled' | 'test' | 'live';
export type PaidTier = 'pro' | 'business';
export type BillingInterval = 'month' | 'year';

/** Fail closed. Enabling production requires a deliberate flag AND a live API key. */
export function billingMode(): BillingMode {
  if (process.env.NASHRA_BILLING_ENABLED !== '1') return 'disabled';
  const wanted = process.env.NASHRA_BILLING_MODE;
  if (wanted !== 'test' && wanted !== 'live') return 'disabled';
  if (wanted === 'live' && process.env.NASHRA_BILLING_LIVE_CONFIRM !== 'I_ACCEPT_REAL_CHARGES') return 'disabled';
  const key = process.env.STRIPE_SECRET_KEY || '';
  if (!key.startsWith(wanted === 'live' ? 'sk_live_' : 'sk_test_')) return 'disabled';
  // Avoid taking real money if the signed webhook cannot update the database.
  if (wanted === 'live' && !process.env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_')) return 'disabled';
  return wanted;
}

/** Legacy diagnostic alias, does not indicate production readiness. */
export function testStripeReady() { return billingMode() === 'test'; }

/** Only server-side env keys are consulted. Price IDs supplied by clients are NEVER accepted. */
export function configuredPrice(tier: PaidTier, interval: BillingInterval = 'month'): string | null {
  const mode = billingMode();
  if (mode === 'disabled') return null;
  const names: Record<'test' | 'live', Record<PaidTier, Record<BillingInterval, string>>> = {
    test: {
      pro: { month: 'STRIPE_TEST_PRO_MONTHLY_PRICE_ID', year: 'STRIPE_TEST_PRO_YEARLY_PRICE_ID' },
      business: { month: 'STRIPE_TEST_BUSINESS_MONTHLY_PRICE_ID', year: 'STRIPE_TEST_BUSINESS_YEARLY_PRICE_ID' },
    },
    live: {
      pro: { month: 'STRIPE_LIVE_PRO_MONTHLY_PRICE_ID', year: 'STRIPE_LIVE_PRO_YEARLY_PRICE_ID' },
      business: { month: 'STRIPE_LIVE_BUSINESS_MONTHLY_PRICE_ID', year: 'STRIPE_LIVE_BUSINESS_YEARLY_PRICE_ID' },
    },
  };
  const legacy = interval === 'month' && mode === 'test'
    ? process.env[tier === 'pro' ? 'STRIPE_TEST_PRICE_ID' : 'STRIPE_TEST_BUSINESS_PRICE_ID']
    : undefined;
  const value = (process.env[names[mode][tier][interval]] || legacy || '').trim();
  return /^price_[a-zA-Z0-9]+$/.test(value) ? value : null;
}

/** Check currency, amount, recurrence and environment on Stripe's own API. */
export function validStripePrice(value: Record<string, unknown>, interval: BillingInterval, usdCents: number): boolean {
  const mode = billingMode();
  const recurring = value.recurring as { interval?: unknown; interval_count?: unknown; usage_type?: unknown } | null;
  return mode !== 'disabled' && value.livemode === (mode === 'live')
    && value.active === true && value.type === 'recurring'
    && value.currency === 'usd' && value.unit_amount === usdCents && usdCents > 0
    && value.billing_scheme === 'per_unit'
    && recurring?.interval === interval && recurring.interval_count === 1
    && recurring.usage_type === 'licensed';
}
/** Compatibility for older callers/tests. */
export const validTestPrice = validStripePrice;

async function stripeRequest(path: string, init: { method: 'GET' | 'POST'; body?: string; idempotencyKey?: string }) {
  if (billingMode() === 'disabled') throw new Error('Facturation non configurée.');
  if (!/^[a-z_\-/0-9]+$/i.test(path)) throw new Error('Chemin Stripe invalide.');
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      ...(init.method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      ...(init.idempotencyKey ? { 'Idempotency-Key': init.idempotencyKey } : {}),
    },
    ...(init.body ? { body: init.body } : {}),
    cache: 'no-store', signal: AbortSignal.timeout(12000),
  });
  const body = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(`Stripe API error (HTTP ${response.status}).`);
  return body;
}
export async function stripePost(path: string, fields: URLSearchParams, idempotencyKey?: string) {
  return stripeRequest(path, { method: 'POST', body: fields.toString(), idempotencyKey });
}
export async function stripeGet(path: string) { return stripeRequest(path, { method: 'GET' }); }

/** Stripe-signed events only; never parse/normalize the raw body before checking. */
export function verifyStripeSignature(payload: string, header: string, secret: string, now = Date.now()) {
  if (!secret.startsWith('whsec_') || !header) return false;
  const fragments = header.split(',').map(x => x.trim());
  const t = fragments.find(x => x.startsWith('t='))?.slice(2);
  const signatures = fragments.filter(x => x.startsWith('v1=')).map(x => x.slice(3));
  if (!t || !/^\d{10,}$/.test(t) || !signatures.length) return false;
  const timestamp = Number(t);
  if (!Number.isSafeInteger(timestamp) || Math.abs(Math.floor(now / 1000) - timestamp) > 300) return false;
  const calculated = createHmac('sha256', secret).update(`${timestamp}.${payload}`, 'utf8').digest();
  return signatures.some(sig => {
    if (!/^[0-9a-f]{64}$/i.test(sig)) return false;
    const provided = Buffer.from(sig, 'hex');
    return provided.length === calculated.length && timingSafeEqual(provided, calculated);
  });
}
export function appUrl() {
  const url = new URL(process.env.NASHRA_APP_URL || '');
  if (!(url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === 'localhost'))) {
    throw new Error('NASHRA_APP_URL doit être HTTPS (ou localhost).');
  }
  if (url.username || url.password || url.search || url.hash) throw new Error('URL application invalide.');
  return url.origin;
}
