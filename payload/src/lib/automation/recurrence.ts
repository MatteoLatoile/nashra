/** Pure calendar arithmetic for recurring rules. No Telegram side effects. */
export type IntervalRecurrence = {
  mode: 'interval';
  intervalDays: number;
  timeZone: string;
  until?: string | null;
};

const dayMs = 86_400_000;
const dateParts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
});
const zoneCache = new Map<string, Intl.DateTimeFormat>();
function zonedFormatter(zone: string) {
  let f = zoneCache.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    zoneCache.set(zone, f);
  }
  return f;
}
function parts(ms: number, zone: string) {
  const values = Object.fromEntries(zonedFormatter(zone).formatToParts(ms)
    .filter(x => x.type !== 'literal').map(x => [x.type, Number(x.value)]));
  return { y: values.year, m: values.month, d: values.day, h: values.hour, min: values.minute };
}
function civilMs(p: ReturnType<typeof parts>) {
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min);
}
function fromCivil(local: ReturnType<typeof parts>, zone: string) {
  const goal = civilMs(local);
  let time = goal;
  for (let i = 0; i < 5; i++) {
    const delta = goal - civilMs(parts(time, zone));
    if (!delta) break;
    time += delta;
  }
  // A DST spring gap can make a particular civil time nonexistent: skip it.
  return civilMs(parts(time, zone)) === goal ? time : null;
}
export function checkRecurrence(rule: IntervalRecurrence): void {
  if (rule.mode !== 'interval' || !Number.isInteger(rule.intervalDays) || rule.intervalDays < 1 || rule.intervalDays > 30)
    throw new Error('La répétition doit être comprise entre 1 et 30 jours.');
  if (typeof rule.timeZone !== 'string' || rule.timeZone.length > 80) throw new Error('Fuseau horaire invalide.');
  try { zonedFormatter(rule.timeZone).format(Date.now()); }
  catch { throw new Error('Fuseau horaire IANA invalide.'); }
  if (rule.until != null && (!/^\d{4}-\d{2}-\d{2}$/.test(rule.until) || Number.isNaN(Date.parse(rule.until))))
    throw new Error('Date de fin invalide.');
}

/** Deterministic local-clock occurrences. `end` is exclusive. */
export function recurringOccurrences(anchorIso: string, rule: IntervalRecurrence,
  start: number, end: number, cap = 60): string[] {
  checkRecurrence(rule);
  const anchor = Date.parse(anchorIso);
  if (!Number.isFinite(anchor) || start >= end || cap < 1) return [];
  const base = parts(anchor, rule.timeZone);
  const startParts = parts(start, rule.timeZone);
  const baseDay = Date.UTC(base.y, base.m - 1, base.d) / dayMs;
  const startDay = Date.UTC(startParts.y, startParts.m - 1, startParts.d) / dayMs;
  let i = Math.max(0, Math.floor((startDay - baseDay) / rule.intervalDays) - 1);
  const result: string[] = [];
  for (let checked = 0; checked < cap + 5 && result.length < cap; checked++, i++) {
    const day = new Date((baseDay + i * rule.intervalDays) * dayMs);
    const p = dateParts.formatToParts(day);
    const dd = Object.fromEntries(p.filter(x => x.type !== 'literal').map(x => [x.type, Number(x.value)]));
    const dayLabel = `${dd.year}-${String(dd.month).padStart(2, '0')}-${String(dd.day).padStart(2, '0')}`;
    if (rule.until && dayLabel > rule.until) break;
    const timestamp = fromCivil({ y: dd.year, m: dd.month, d: dd.day, h: base.h, min: base.min }, rule.timeZone);
    if (timestamp != null && timestamp >= anchor && timestamp >= start && timestamp < end) result.push(new Date(timestamp).toISOString());
    if (Date.UTC(dd.year, dd.month - 1, dd.day) > end + dayMs) break;
  }
  return result;
}

export const RECURRING_GAP_SECONDS = 90;
export function destinationSendAt(occurrenceIso: string, index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= 20) throw new Error('Index de groupe invalide.');
  return new Date(Date.parse(occurrenceIso) + index * RECURRING_GAP_SECONDS * 1000).toISOString();
}

/** Convert a datetime-local value as wall-clock time in the chosen IANA zone. */
export function localClockToISOString(input: string, zone: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(input);
  if (!match) throw new Error('Date et heure invalides.');
  const [y,m,d,h,min] = match.slice(1).map(Number);
  const instant = fromCivil({y,m,d,h,min},zone);
  if (instant == null) throw new Error('Cette heure locale n’existe pas dans ce fuseau horaire (changement d’heure).');
  return new Date(instant).toISOString();
}
