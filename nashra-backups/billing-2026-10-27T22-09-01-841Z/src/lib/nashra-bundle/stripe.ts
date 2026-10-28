import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

export function testStripeReady() {
  return process.env.NASHRA_BILLING_ENABLED === '1' && (process.env.STRIPE_SECRET_KEY || '').startsWith('sk_test_');
}
export async function stripePost(path: string, fields: URLSearchParams): Promise<Record<string, unknown>> {
  const key = process.env.STRIPE_SECRET_KEY || '';
  if (!testStripeReady()) throw new Error('Paiements de test Stripe désactivés.');
  const res = await fetch(`https://api.stripe.com/v1/${path}`, { method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: fields.toString(), cache: 'no-store' });
  const data = await res.json() as Record<string, unknown>;
  if (!res.ok) throw new Error('Stripe a refusé la demande. Vérifiez les réglages de test et le prix configuré.');
  return data;
}
export function verifyStripeSignature(payload: string, header: string, secret: string, now = Date.now()) {
  if (!secret.startsWith('whsec_') || !header) return false;
  const fragments = header.split(',').map(x => x.trim());
  const t = fragments.find(x => x.startsWith('t='))?.slice(2);
  const signatures = fragments.filter(x => x.startsWith('v1=')).map(x => x.slice(3));
  if (!t || !/^\d{10,}$/.test(t) || !signatures.length) return false;
  const timestamp = Number(t);
  if (!Number.isSafeInteger(timestamp) || Math.abs(Math.floor(now / 1000) - timestamp) > 300) return false;
  const calculated = createHmac('sha256',secret).update(`${timestamp}.${payload}`,'utf8').digest();
  return signatures.some(sig => { if (!/^[0-9a-f]{64}$/i.test(sig)) return false;
    const provided = Buffer.from(sig, 'hex');
    return provided.length === calculated.length && timingSafeEqual(provided, calculated);
  });
}
export function appUrl() {
  const value = process.env.NASHRA_APP_URL || '';
  const url = new URL(value);
  if (!(url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === 'localhost'))) {
    throw new Error('NASHRA_APP_URL doit être HTTPS (ou localhost).');
  }
  if (url.username || url.password || url.search || url.hash) throw new Error('URL application invalide.');
  return url.origin;
}
