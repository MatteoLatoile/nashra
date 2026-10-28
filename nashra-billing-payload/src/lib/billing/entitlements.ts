import { configuredPrice } from '@/lib/nashra-bundle/stripe';

/** SQL 009 enforces these concurrently for pending operations, never per month. */
export type NashraTier = 'free' | 'pro' | 'business';
export const QUEUE_LIMITS: Record<NashraTier, number> = { free: 100, pro: 300, business: 500 };

/** Only verified subscription webhook events can call this server-side helper. */
export function tierFromVerifiedSubscription(status: string, priceId: string | null): NashraTier {
  if (!['active', 'trialing'].includes(status) || !priceId) return 'free';
  if (configuredPrice('business') === priceId) return 'business';
  if (configuredPrice('pro') === priceId) return 'pro';
  return 'free';
}
/** Legacy alias: older V3 diagnostic code may still import this. */
export const tierFromVerifiedTestSubscription = tierFromVerifiedSubscription;
