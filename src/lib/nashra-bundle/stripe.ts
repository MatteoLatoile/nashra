import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

export type BillingMode = 'disabled' | 'test' | 'live';
export type PaidTier = 'pro' | 'business';

/** Real payments require two explicit switches. The default is always TEST. */
export function billingMode(): BillingMode {
  if (process.env.NASHRA_BILLING_ENABLED !== '1') return 'disabled';
  // Commercial launch has NOT been approved. This release is TEST ONLY.
  if (process.env.NASHRA_BILLING_MODE === 'live') return 'disabled';
  const wanted = process.env.NASHRA_BILLING_MODE === 'live' ? 'live' : 'test';
  if (wanted === 'live' && process.env.NASHRA_BILLING_LIVE_CONFIRM !== 'I_ACCEPT_REAL_CHARGES') return 'disabled';
  const key = process.env.STRIPE_SECRET_KEY || '';
  if (!key.startsWith(wanted === 'live' ? 'sk_live_' : 'sk_test_')) return 'disabled';
  return wanted;
}

/** Backwards compatible for older read-only diagnostics. */
export function testStripeReady() { return billingMode() === 'test'; }

export type BillingInterval = 'month' | 'year';

/** Four test prices. Keep legacy monthly names to avoid breaking local setups. */
export function configuredPrice(tier: PaidTier, interval: BillingInterval = 'month'): string | null {
  if (billingMode() !== 'test') return null;
  const envName = interval === 'year'
    ? (tier === 'pro' ? 'STRIPE_TEST_PRO_YEARLY_PRICE_ID' : 'STRIPE_TEST_BUSINESS_YEARLY_PRICE_ID')
    : (tier === 'pro' ? 'STRIPE_TEST_PRO_MONTHLY_PRICE_ID' : 'STRIPE_TEST_BUSINESS_MONTHLY_PRICE_ID');
  const legacyName = tier === 'pro' ? 'STRIPE_TEST_PRICE_ID' : 'STRIPE_TEST_BUSINESS_PRICE_ID';
  const value = (process.env[envName] || (interval === 'month' ? process.env[legacyName] : '') || '').trim();
  return /^price_[a-zA-Z0-9]+$/.test(value) ? value : null;
}

/** Verify the remote Price before opening checkout; cents match DB catalogue. */
export function validTestPrice(value: Record<string, unknown>, interval: BillingInterval, usdCents: number): boolean {
  const recurring = value.recurring as {interval?: unknown;interval_count?: unknown;usage_type?: unknown} | null;
  return value.livemode === false && value.active === true && value.type === 'recurring'
    && value.currency === 'usd' && value.unit_amount === usdCents && usdCents > 0
    && value.billing_scheme === 'per_unit' && recurring?.interval === interval
    && recurring.interval_count === 1 && recurring.usage_type === 'licensed';
}

async function stripeRequest(path: string, init: {method: 'GET' | 'POST'; body?: string}) {
  if (billingMode() === 'disabled') throw new Error('Facturation non configurée.');
  if (!/^[a-z_\-/0-9]+$/i.test(path)) throw new Error('Chemin Stripe invalide.');
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: init.method,
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      ...(init.method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    ...(init.body ? { body: init.body } : {}),
    cache: 'no-store', signal: AbortSignal.timeout(12000),
  });
  const body = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error('Stripe a refusé la requête.');
  return body;
}
export async function stripePost(path: string, fields: URLSearchParams) {
  return stripeRequest(path, { method: 'POST', body: fields.toString() });
}
export async function stripeGet(path: string) { return stripeRequest(path, { method: 'GET' }); }

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
