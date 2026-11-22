'use client';

export const GA_MEASUREMENT_ID = 'G-66RJ9HL868';
export const GA_CONSENT_KEY = 'nashra_ga4_consent_v1';

type SafeAnalyticsEvent = 'sign_up_requested' | 'subscription_activated';
type SafeEventParams = { method?: 'email'; plan?: 'pro' | 'business'; interval?: 'month' | 'year' };

declare global {
  interface Window {
    dataLayer?: unknown[][];
    gtag?: (...args: unknown[]) => void;
  }
}

export function hasAnalyticsConsent(): boolean {
  try { return window.localStorage.getItem(GA_CONSENT_KEY) === 'granted'; }
  catch { return false; }
}

/** Never send identifiers, emails, passwords, checkout IDs, or payment values to Analytics. */
export function trackNashraEvent(name: SafeAnalyticsEvent, params: SafeEventParams = {}): boolean {
  if (typeof window === 'undefined' || !hasAnalyticsConsent() || !window.gtag) return false;
  window.gtag('event', name, params);
  return true;
}

/** Local deduplication of verified Stripe activation: no session id is transmitted to GA. */
export function trackVerifiedSubscription(sessionId: string, plan?: string, interval?: string): void {
  if (!/^cs_(test_|live_)[A-Za-z0-9]+$/.test(sessionId)) return;
  if (plan !== 'pro' && plan !== 'business') return;
  if (interval !== 'month' && interval !== 'year') return;
  try {
    const key = `nashra_ga4_activation_${sessionId}`;
    if (window.localStorage.getItem(key)) return;
    if (trackNashraEvent('subscription_activated', { plan, interval })) {
      window.localStorage.setItem(key, '1');
    }
  } catch { /* Analytics must never interfere with billing UI. */ }
}
