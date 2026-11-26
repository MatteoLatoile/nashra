/** Read-only, metadata-only diagnostics for scheduled vs published timestamps.
 * Telegram timestamps are UNIX seconds (UTC), scheduled_at is an ISO instant.
 * These measurements must never, by themselves, confirm publication.
 */
export function summarizePublishedTimeOffsets(
  allUnixSeconds: readonly number[],
  matchingTextUnixSeconds: readonly number[],
  plannedIso: string,
) {
  const plannedMs = Date.parse(plannedIso);
  if (!Number.isFinite(plannedMs)) return {
    validPlannedTime: false, nearestSameTextDeltaSeconds: null,
    oldestReturnedDeltaSeconds: null, newestReturnedDeltaSeconds: null,
    sameTextWithin2Minutes: 0, sameTextWithin5Minutes: 0,
    sameTextWithin1Hour: 0, sameTextWithin3Hours: 0,
  };
  const plannedUnix = plannedMs / 1000;
  const differences = matchingTextUnixSeconds
    .filter(Number.isFinite).map(value => Math.round(value - plannedUnix));
  const allDiffs = allUnixSeconds.filter(Number.isFinite).map(value => Math.round(value - plannedUnix));
  const nearest = differences.reduce<number | null>((best, value) =>
    best === null || Math.abs(value) < Math.abs(best) ? value : best, null);
  return {
    validPlannedTime: true,
    // Signed: negative = same-text post OLDER than scheduled time; positive = newer.
    nearestSameTextDeltaSeconds: nearest,
    oldestReturnedDeltaSeconds: allDiffs.length ? Math.min(...allDiffs) : null,
    newestReturnedDeltaSeconds: allDiffs.length ? Math.max(...allDiffs) : null,
    sameTextWithin2Minutes: differences.filter(value => Math.abs(value) <= 120).length,
    sameTextWithin5Minutes: differences.filter(value => Math.abs(value) <= 300).length,
    sameTextWithin1Hour: differences.filter(value => Math.abs(value) <= 3600).length,
    sameTextWithin3Hours: differences.filter(value => Math.abs(value) <= 10800).length,
  };
}
