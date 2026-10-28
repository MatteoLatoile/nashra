/** Quotas are enforced by SQL 009, not the React UI. */
export type NashraTier = 'free' | 'pro' | 'business';
export const QUEUE_LIMITS: Record<NashraTier, number> = {
  free: 100,
  pro: 300,
  business: 500,
};

/** Only Stripe test webhook events with an exact, configured price grant a test tier. */
export function tierFromVerifiedTestSubscription(status: string, priceId: string | null): NashraTier {
  if (!['active', 'trialing'].includes(status) || !priceId) return 'free';
  const business = process.env.STRIPE_TEST_BUSINESS_PRICE_ID;
  const pro = process.env.STRIPE_TEST_PRICE_ID;
  if (business && business.startsWith('price_') && business === priceId) return 'business';
  if (pro && pro.startsWith('price_') && pro === priceId) return 'pro';
  return 'free';
}
