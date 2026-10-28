/** Read-only readiness checks. Never calls Telegram or sends messages. */
export type Ad = { id?: string; title?: string; sourceChatId?: string; sourceMessageId?: number; body?: string };
export type Dest = { id?: string; name?: string; handle?: string; authorized?: boolean };
export type CampaignLike = { id?: string; name?: string; status?: string; method?: string; announcementId?: string; announcementIds?: string[]; destinationIds?: string[]; scheduledAt?: string; scheduledDates?: string[] };
export type Workspace = { announcements?: Ad[]; destinations?: Dest[]; campaigns?: CampaignLike[] };
export type Issue = { code: string; message: string };
export type Check = { id: string; name: string; status: string; dates: number; nextDate: string | null; dueSlots: number; totalDeliveries: number; issues: Issue[]; ready: boolean };
const validTime = (s: string): number | null => { const x = Date.parse(s); return Number.isFinite(x) ? x : null; };
export function readiness(data: Workspace, instant = Date.now()) {
  const ads = new Map((Array.isArray(data.announcements) ? data.announcements : []).map(a => [a.id, a]));
  const destinations = new Map((Array.isArray(data.destinations) ? data.destinations : []).map(d => [d.id, d]));
  const campaigns = Array.isArray(data.campaigns) ? data.campaigns : [];
  const checks: Check[] = campaigns.map((c, i) => {
    const issues: Issue[] = [];
    const add = (code: string, message: string) => { if (!issues.some(x => x.code === code)) issues.push({ code, message }); };
    const ids = Array.isArray(c.announcementIds) && c.announcementIds.length ? [...new Set(c.announcementIds)] : c.announcementId ? [c.announcementId] : [];
    const dids = Array.isArray(c.destinationIds) ? [...new Set(c.destinationIds)] : [];
    const raw = Array.isArray(c.scheduledDates) && c.scheduledDates.length ? c.scheduledDates : c.scheduledAt ? [c.scheduledAt] : [];
    const times = [...new Set(raw.map(x => typeof x === 'string' ? x : '').filter(Boolean))].map(validTime);
    const dateValues = times.filter((x): x is number => x !== null).sort((a,b) => a-b);
    if (dateValues.length !== raw.length) add('date', 'Un ou plusieurs créneaux sont invalides.');
    if (!dateValues.length) add('missing_date', 'Aucun créneau valide.');
    if (!ids.length) add('missing_ads', 'Aucune annonce sélectionnée.');
    if (!dids.length) add('missing_dest', 'Aucune destination sélectionnée.');
    if (c.status !== 'scheduled') add('paused', 'Campagne en pause ou statut inconnu.');
    if (c.method !== 'forward' && c.method !== 'repost') add('method', 'Mode de publication invalide.');
    for (const id of ids) {
      const ad = ads.get(id);
      if (!ad) { add('unknown_ad', 'Une annonce est introuvable.'); continue; }
      // Existing personal-account publisher sends/forwards an accessible Telegram message.
      if (!ad.sourceChatId || !Number.isSafeInteger(ad.sourceMessageId) || (ad.sourceMessageId ?? 0) <= 0) add('source', 'Une annonce ne possède pas de message Telegram source valide.');
    }
    for (const id of dids) {
      const dest = destinations.get(id);
      if (!dest) { add('unknown_dest', 'Une destination est introuvable.'); continue; }
      if (dest.authorized !== true) add('unauthorized', 'Une destination n’est pas déclarée autorisée.');
      if (!dest.handle || !/^(-?\d{3,30}|-100\d{3,30})$/.test(dest.handle)) add('handle', 'Un identifiant de destination Telegram est invalide.');
    }
    const dueSlots = dateValues.filter(x => x <= instant).length;
    const next = dateValues.find(x => x > instant);
    return { id: c.id || `campaign-${i}`, name: c.name || 'Campagne sans nom', status: c.status || 'unknown', dates: dateValues.length, nextDate: next === undefined ? null : new Date(next).toISOString(), dueSlots, totalDeliveries: dateValues.length * ids.length * dids.length, issues, ready: issues.length === 0 };
  });
  return { generatedAt: new Date(instant).toISOString(), automaticPublishingEnabled: false as const, campaigns: checks, totals: { campaigns: checks.length, ready: checks.filter(x => x.ready).length, blocked: checks.filter(x => !x.ready).length, dueSlots: checks.filter(x => x.ready).reduce((n,x) => n + x.dueSlots,0) } };
}
