/** Shared browser-only quota snapshot. Supabase remains the only authority for limits. */
export type LimitsSnapshot = {
  tier?: string;
  usage?: {
    telegramAccounts: { used: number; limit: number };
    activeGroups: { used: number; limit: number };
    monthlySends: { used: number; limit: number };
    pendingSchedules: { used: number; limit: number };
  };
};
const TTL_MS = 15_000;
let cached: { userKey: string; until: number; value: LimitsSnapshot } | null = null;
let inflight: { userKey: string; promise: Promise<LimitsSnapshot> } | null = null;
let version = 0;
let invalidatedThisTurn = false;

export function invalidateLimits() {
  // Several widgets may receive the same billing event synchronously.
  // Invalidate only once so they can still share the subsequent request.
  if (invalidatedThisTurn) return;
  invalidatedThisTurn = true;
  queueMicrotask(() => { invalidatedThisTurn = false; });
  version++;
  cached = null;
  inflight = null;
}

export function loadLimits(userKey: string, fresh = false): Promise<LimitsSnapshot> {
  if (!fresh && cached?.userKey === userKey && cached.until > Date.now()) {
    return Promise.resolve(cached.value);
  }
  if (inflight?.userKey === userKey) return inflight.promise;
  const requestedVersion = version;
  const promise = fetch('/api/billing/limits', { credentials: 'same-origin', cache: 'no-store' })
    .then(async response => {
      if (!response.ok) throw new Error('Quotas indisponibles');
      const data = (await response.json()) as LimitsSnapshot;
      if (version === requestedVersion) cached = { userKey, until: Date.now() + TTL_MS, value: data };
      return data;
    });
  inflight = { userKey, promise };
  void promise.finally(() => { if (inflight?.promise === promise) inflight = null; }).catch(() => {});
  return promise;
}
