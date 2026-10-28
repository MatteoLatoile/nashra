import { readiness, type Workspace, type CampaignLike, type Ad, type Dest } from './readiness';

export type PlannedDelivery = {
  key: string; campaignId: string; campaignName: string;
  announcementId: string; announcementTitle: string;
  destinationId: string; destinationName: string;
  scheduledAt: string; method: 'forward' | 'repost'; state: 'upcoming' | 'overdue';
};
export type ExecutionPlan = {
  generatedAt: string; automaticPublishingEnabled: false;
  total: number; hasMore: boolean; skippedCampaigns: number;
  deliveries: PlannedDelivery[]; warnings: string[];
};
const MAX_PREVIEW = 250;
const MAX_SLOTS_PER_CAMPAIGN = 250;
// In-memory deterministic preview: no Supabase writes and absolutely no Telegram calls.
export function makeExecutionPlan(workspace: Workspace, now = Date.now()): ExecutionPlan {
  const audit = readiness(workspace, now);
  const byId = new Map(audit.campaigns.map(c => [c.id, c]));
  const ads = new Map<string, Ad>((workspace.announcements ?? []).filter(a => typeof a.id === 'string').map(a => [a.id!, a]));
  const dests = new Map<string, Dest>((workspace.destinations ?? []).filter(d => typeof d.id === 'string').map(d => [d.id!, d]));
  const deliveries: PlannedDelivery[] = [];
  const warnings: string[] = [];
  let total = 0;
  let skippedCampaigns = 0;
  for (const campaign of workspace.campaigns ?? []) {
    const check = byId.get(campaign.id ?? '');
    if (!check?.ready) { skippedCampaigns++; continue; }
    const announcementIds = [...new Set((campaign.announcementIds?.length ? campaign.announcementIds : campaign.announcementId ? [campaign.announcementId] : []))];
    const destinationIds = [...new Set(campaign.destinationIds ?? [])];
    const rawSlots = campaign.scheduledDates?.length ? campaign.scheduledDates : campaign.scheduledAt ? [campaign.scheduledAt] : [];
    const slots = [...new Set(rawSlots)].sort((a,b) => Date.parse(a) - Date.parse(b));
    if (slots.length > MAX_SLOTS_PER_CAMPAIGN) {
      warnings.push(`Campagne ${campaign.name ?? campaign.id ?? ''} : plus de ${MAX_SLOTS_PER_CAMPAIGN} créneaux, aperçu limité.`);
    }
    for (const slot of slots.slice(0, MAX_SLOTS_PER_CAMPAIGN)) {
      const timestamp = Date.parse(slot);
      if (!Number.isFinite(timestamp)) continue;
      for (const aId of announcementIds) {
        for (const dId of destinationIds) {
          const ad = ads.get(aId);
          const dest = dests.get(dId);
          if (!ad || !dest || !campaign.id || !['forward','repost'].includes(campaign.method ?? '')) continue;
          total++;
          if (deliveries.length >= MAX_PREVIEW) continue;
          deliveries.push({
            key: `${campaign.id}:${slot}:${aId}:${dId}`,
            campaignId: campaign.id, campaignName: campaign.name ?? 'Sans nom',
            announcementId: aId, announcementTitle: ad.title ?? aId,
            destinationId: dId, destinationName: dest.name ?? dId,
            scheduledAt: new Date(timestamp).toISOString(),
            method: campaign.method as 'forward' | 'repost',
            state: timestamp <= now ? 'overdue' : 'upcoming',
          });
        }
      }
    }
  }
  deliveries.sort((a,b) => a.scheduledAt.localeCompare(b.scheduledAt) || a.key.localeCompare(b.key));
  if (total > MAX_PREVIEW) warnings.push(`Aperçu limité aux ${MAX_PREVIEW} premières lignes générées ; l'ensemble contient ${total} opérations.`);
  if (skippedCampaigns > 0) warnings.push(`${skippedCampaigns} campagne(s) ignorée(s) car les contrôles de préparation ont échoué.`);
  return { generatedAt: new Date(now).toISOString(), automaticPublishingEnabled: false, total, hasMore: total > deliveries.length, skippedCampaigns, deliveries, warnings };
}
