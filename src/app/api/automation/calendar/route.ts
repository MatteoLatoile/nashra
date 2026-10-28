/** Schedules with explicit user consent; no Telegram sends from this endpoint. */
import { NextRequest, NextResponse } from 'next/server';
import { context } from '@/lib/telegram-user/core';
import { getServiceClient, buildAnnouncementDelivery, DeliveryBlocked } from '@/lib/automation/worker';
import { readiness, type Workspace } from '@/lib/automation/readiness';
import { makeExecutionPlan } from '@/lib/automation/plan';
import { reserveSendWithOrigin, finalizeSend } from '@/lib/billing/quotas-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type FormCampaign = {
  id: string; name: string; announcementId: string; announcementIds: string[];
  destinationIds: string[]; method: 'repost'; scheduledAt: string;
  scheduledDates: string[]; status: 'scheduled'; createdAt: string;
};

function validate(raw: unknown, userId: string, workspace: Workspace): FormCampaign {
  if (!raw || typeof raw !== 'object') throw new DeliveryBlocked('Campagne invalide.');
  const c = raw as Partial<FormCampaign>;
  if (typeof c.id !== 'string' || !UUID.test(c.id) || typeof c.name !== 'string' || !c.name.trim() || c.name.length > 90)
    throw new DeliveryBlocked('Nom ou identifiant de campagne invalide.');
  const ids = [...new Set(Array.isArray(c.announcementIds) ? c.announcementIds : [])];
  const dests = [...new Set(Array.isArray(c.destinationIds) ? c.destinationIds : [])];
  const slots = [...new Set(Array.isArray(c.scheduledDates) ? c.scheduledDates : [])];
  if (!ids.length || !dests.length || !slots.length || ids.length * dests.length * slots.length > 30)
    throw new DeliveryBlocked('Sélectionnez annonces, groupes et dates (30 publications maximum par programmation).');
  const now = Date.now();
  for (const time of slots) {
    if (typeof time !== 'string' || !Number.isFinite(Date.parse(time)) || new Date(time).toISOString() !== time ||
        Date.parse(time) < now + 3 * 60_000 || Date.parse(time) > now + 90 * 86400_000)
      throw new DeliveryBlocked('Planifiez entre 3 minutes et 90 jours à l’avance.');
  }
  if (c.method !== 'repost') throw new DeliveryBlocked('Les nouvelles annonces sont publiées en mode republication.');
  const ads = (workspace.announcements ?? []).filter(a => ids.includes(a.id ?? ''));
  const selectedDestinations = (workspace.destinations ?? []).filter(d => dests.includes(d.id ?? ''));
  if (ads.length !== ids.length || selectedDestinations.length !== dests.length)
    throw new DeliveryBlocked('Une annonce ou une destination n’existe plus.');
  for (const dest of selectedDestinations) {
    if (dest.authorized !== true || !dest.handle || !/^-?\d{3,30}$/.test(dest.handle))
      throw new DeliveryBlocked('Seuls les groupes autorisés avec identifiant Telegram numérique peuvent être programmés.');
    for (const ad of ads) buildAnnouncementDelivery(ad, dest.handle, 'repost', userId);
  }
  return { id: c.id, name: c.name.trim(), announcementId: ids[0], announcementIds: ids,
    destinationIds: dests, method: 'repost', scheduledAt: slots[0], scheduledDates: slots.sort(),
    status: 'scheduled', createdAt: typeof c.createdAt === 'string' && Number.isFinite(Date.parse(c.createdAt))
      ? c.createdAt : new Date().toISOString() };
}

export async function POST(req: NextRequest) {
  try {
    const c = await context(req, true);
    const body = await req.json() as { action?: 'schedule' | 'pause' | 'resume' | 'delete'; confirmed?: boolean; campaign?: unknown; campaignId?: string };
    if (body.confirmed !== true || !['schedule','pause','resume','delete'].includes(body.action ?? ''))
      return NextResponse.json({ error: 'Action explicitement confirmée requise.' }, { status: 400, headers });
    const service = getServiceClient();
    const { data: record, error: readError } = await c.supabase.from('workspaces').select('data').eq('user_id', c.userId).maybeSingle();
    if (readError || !record?.data) throw new DeliveryBlocked('Espace cloud introuvable : créez une annonce puis réessayez.');
    const previous = record.data as Workspace & { activity?: unknown[] };
    const current = Array.isArray(previous.campaigns) ? previous.campaigns : [];
    const action = body.action;
    let id: string;
    let newCampaigns: typeof current;
    if (action === 'schedule') {
      const input = validate(body.campaign, c.userId, previous);
      id = input.id;
      const found = current.find(x => x.id === id);
      if (found) throw new DeliveryBlocked('Modification risquée : supprimez ou mettez en pause la campagne, puis créez une nouvelle programmation.');
      newCampaigns = [input, ...current];
    } else {
      id = body.campaignId ?? '';
      if (!id || !current.some(x => x.id === id)) throw new DeliveryBlocked('Campagne introuvable.');
      if ((current.find(x => x.id === id) as (typeof current)[number] & {nativeTelegram?:boolean})?.nativeTelegram)
        throw new DeliveryBlocked('Cette programmation est gérée par Telegram : annulez-la depuis le calendrier natif.');
      newCampaigns = action === 'delete' ? current.filter(x => x.id !== id) : current.map(x => x.id === id
        ? { ...x, status: action === 'pause' ? 'paused' : 'scheduled' } : x);
    }
    const oldJobsQuery = await service.from('delivery_queue')
      .select('id,job_key,status').eq('user_id', c.userId).eq('campaign_id', id).limit(100);
    if (oldJobsQuery.error) throw new DeliveryBlocked('File d’attente inaccessible.');
    const oldJobs = oldJobsQuery.data ?? [];
    if (action === 'resume' && oldJobs.some(x => ['processing','sent','needs_review'].includes(x.status)))
      throw new DeliveryBlocked('Cette campagne contient des tentatives terminées ou incertaines : créez une nouvelle campagne, sans republier automatiquement.');
    const next = { ...previous, campaigns: newCampaigns };
    let plan = [] as ReturnType<typeof makeExecutionPlan>['deliveries'];
    if (action === 'schedule' || action === 'resume') {
      const r = readiness(next).campaigns.find(x => x.id === id);
      if (!r?.ready) throw new DeliveryBlocked(r?.issues.map(x => x.message).join(' ') || 'Campagne non prête.');
      const computed = makeExecutionPlan({ ...next, campaigns: newCampaigns.filter(x => x.id === id) });
      if (computed.hasMore || computed.total > 30) throw new DeliveryBlocked('Trop de publications à programmer.');
      plan = computed.deliveries.filter(x => x.state === 'upcoming' && Date.parse(x.scheduledAt) > Date.now() + 2 * 60_000);
      if (!plan.length || plan.length !== computed.total) throw new DeliveryBlocked('Un créneau n’est plus disponible.');
      // SQL 016 atomically controls pending schedules, including service-role inserts.
    }

    // Reserve each future send in SQL 015 before saving the schedule.
    // Roll back all new reservations if preparation is rejected before any send.
    const bookings = new Map<string,{id:string;created:boolean}>();
    try {
      for (const job of plan) {
        const booking = await reserveSendWithOrigin({ userId: c.userId, key: `job:${job.key}`,
          announcementId: job.announcementId, destinationId: job.destinationId, scheduledAt: job.scheduledAt });
        bookings.set(job.key,booking);
      }
    } catch (err) {
      for (const booking of bookings.values()) if (booking.created) await finalizeSend(c.userId,booking.id,'released');
      throw new DeliveryBlocked(err instanceof Error ? err.message : 'Quota indisponible.');
    }
    // Save the campaign before any queued job is approved. The worker rechecks
    // the workspace again before sending and never publishes merely from this API.
    const { error: writeError } = await c.supabase.from('workspaces').update({ data: next }).eq('user_id', c.userId);
    if (writeError) {
      for (const booking of bookings.values()) if (booking.created) await finalizeSend(c.userId,booking.id,'released');
      throw new DeliveryBlocked('Sauvegarde du calendrier impossible.');
    }
    const cancelledKeys = new Set<string>();
    let approvalsStarted = false;
    try {
      if (oldJobs.length) {
        const ids = oldJobs.filter(x => ['held','approved'].includes(x.status)).map(x => x.id);
        if (ids.length) {
          const { data: cancelled, error } = await service.from('delivery_queue').update({ status: 'cancelled', updated_at: new Date().toISOString() })
            .eq('user_id', c.userId).in('id', ids).in('status',['held','approved']).select('job_key');
          if (error) throw error;
          for (const entry of cancelled ?? []) cancelledKeys.add(entry.job_key);
        }
      }
      if (plan.length) {
        const payload = plan.map(job => ({ user_id: c.userId, job_key: job.key, campaign_id: job.campaignId,
          announcement_id: job.announcementId, destination_id: job.destinationId,
          scheduled_at: job.scheduledAt, method: job.method, status: 'held' }));
        const { error: upsertError } = await service.from('delivery_queue').upsert(payload, { onConflict: 'user_id,job_key' });
        if (upsertError) throw upsertError;
        const keys = payload.map(x => x.job_key);
        approvalsStarted = true;
        const { data: approved, error: approvalError } = await service.from('delivery_queue')
          .update({ status: 'approved', updated_at: new Date().toISOString() }).eq('user_id', c.userId)
          .eq('campaign_id', id).in('job_key', keys).eq('status', 'held').select('id');
        if (approvalError || (approved?.length ?? 0) !== keys.length) throw approvalError || new Error('Approval incomplete');
      }
    } catch {
      // Fail closed. At worst a partially created held job remains; never approve it.
      await service.from('delivery_queue').update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('user_id', c.userId).eq('campaign_id', id).in('status', ['held','approved']);
      // Once an approval may have happened, cron could have claimed an entry.
      // Conservatively retain bookings rather than release an attempted send.
      if (!approvalsStarted) for (const booking of bookings.values())
        if (booking.created) await finalizeSend(c.userId,booking.id,'released');
      return NextResponse.json({ error: 'Programmation incomplète : tâches annulées par précaution. Rechargez Nashra et vérifiez la file avant de recommencer.' }, { status: 500, headers });
    }
    if (action === 'delete') {
      for (const job of oldJobs.filter(x => x.status === 'cancelled' || cancelledKeys.has(x.job_key))) {
        const { data: entry } = await service.from('nashra_send_reservations').select('id,status')
          .eq('user_id',c.userId).eq('idempotency_key',`job:${job.job_key}`).maybeSingle();
        if (entry?.status === 'reserved') await finalizeSend(c.userId,entry.id,'released');
      }
    }
    return NextResponse.json({ ok: true, workspace: next, scheduled: plan.length,
      automationEnabled: process.env.NASHRA_AUTOMATION_ENABLED === '1' && process.env.NASHRA_PUBLISHING_ENABLED === '1' }, { headers });
  } catch (err) {
    const message = err instanceof DeliveryBlocked ? err.message : 'Programmation impossible. Vérifiez les migrations et vos permissions.';
    return NextResponse.json({ error: message }, { status: err instanceof DeliveryBlocked ? 400 : 500, headers });
  }
}
