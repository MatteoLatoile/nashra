/** Server-side rolling window of Telegram-native schedules for interval rules. */
import 'server-only';
import type { AppData, Campaign } from '@/lib/store';
import { buildAnnouncementDelivery, getServiceClient, loadAlbum, safeReason, DeliveryBlocked } from './worker';
import { recurringOccurrences, destinationSendAt, type IntervalRecurrence } from './recurrence';
import { cancelTelegramSchedule, scheduleOnConnectedTelegram, withSchedulingClient } from './telegram-native';
import { reserveSendWithOrigin, finalizeSend } from '@/lib/billing/quotas-server';

const db = getServiceClient;
const HORIZON_MS = 9 * 86_400_000;
const MAX_PER_RUN = 24;
const MIN_FUTURE_MS = 180_000;
const DAILY_CAP = 30; // Conservative technical guard, distinct from commercial monthly quota.

export type RecurringRule = {
  id: string; user_id: string; announcement_id: string; destination_ids: string[];
  anchor_at: string; interval_days: number; time_zone: string; until_day: string | null;
  status: 'active' | 'paused'; last_problem: string | null;
};
export const recurringKey = (campaignId: string, dateIso: string, destinationId: string) =>
  `recurring:${campaignId}:${dateIso}:${destinationId}`;

async function markRule(id: string, status: 'active' | 'paused', last_problem: string | null) {
  const { error } = await db().from('nashra_recurring_rules').update({ status, last_problem, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error('Impossible de mettre à jour la règle récurrente.');
}
function matches(rule: RecurringRule, c: Campaign | undefined) {
  return c?.status === 'scheduled' && c?.recurrence?.mode === 'interval'
    && c.announcementId === rule.announcement_id && c.scheduledAt === rule.anchor_at
    && c.recurrence.intervalDays === rule.interval_days && c.recurrence.timeZone === rule.time_zone
    && JSON.stringify(c.destinationIds) === JSON.stringify(rule.destination_ids);
}

export type FillResult = { scheduled: number; existing: number; problem: string | null };
export async function fillRecurringRule(rule: RecurringRule, limit = MAX_PER_RUN): Promise<FillResult> {
  const result: FillResult = { scheduled: 0, existing: 0, problem: null };
  if (rule.status !== 'active' || process.env.NASHRA_DISABLE_ALL_SENDS === '1' || process.env.NASHRA_RECURRING_ENABLED !== '1') return result;
  const store = db();
  const [{ data: ws, error: wsError }, { data: account, error: accError }] = await Promise.all([
    store.from('workspaces').select('data').eq('user_id',rule.user_id).maybeSingle(),
    store.from('telegram_accounts').select('session_ciphertext').eq('user_id',rule.user_id).maybeSingle(),
  ]);
  const data = ws?.data as AppData | undefined;
  const campaign = data?.campaigns?.find(c => c.id === rule.id);
  if (wsError || !data || !matches(rule,campaign) || !data.announcements || !data.destinations) {
    result.problem = 'Règle modifiée ou absente de l’espace de travail : programmation suspendue.';
    await markRule(rule.id, 'paused', result.problem);
    return result;
  }
  if (accError || !account?.session_ciphertext) {
    result.problem = 'Compte Telegram déconnecté. Reconnectez-le pour reprendre la récurrence.';
    await markRule(rule.id, 'paused', result.problem);
    return result;
  }
  const announcement = data.announcements.find(a => a.id === rule.announcement_id);
  const dests = rule.destination_ids.map(id => data.destinations.find(d => d.id === id));
  if (!announcement || dests.some(d => !d?.authorized || !d.handle || !/^-?\d{3,30}$/.test(d.handle))) {
    result.problem = 'Annonce ou groupe absent, non autorisé ou invalide.';
    await markRule(rule.id, 'paused', result.problem);
    return result;
  }
  const targets = dests.filter((d): d is NonNullable<typeof d> => Boolean(d));
  let works: ReturnType<typeof buildAnnouncementDelivery>[];
  let album: Buffer[] | undefined;
  try {
    works = targets.map(target => buildAnnouncementDelivery(announcement, target.handle, 'repost', rule.user_id));
    album = works[0].kind === 'album' ? await loadAlbum(store, works[0].photos) : undefined;
  } catch (error) {
    result.problem = safeReason(error);
    await markRule(rule.id, 'paused', result.problem);
    return result;
  }
  const repeat: IntervalRecurrence = { mode:'interval', intervalDays:rule.interval_days,
    timeZone:rule.time_zone, until:rule.until_day };
  const now = Date.now();
  const occurrences = recurringOccurrences(rule.anchor_at, repeat, now + MIN_FUTURE_MS,
    now + HORIZON_MS, 10);
  const options = occurrences.flatMap(at => targets.map((target, index) => ({
    target, work: works[index], scheduledAt: destinationSendAt(at,index), key: recurringKey(rule.id,at,target.id),
  }))).filter(job => Date.parse(job.scheduledAt) > Date.now() + MIN_FUTURE_MS);
  if (!options.length) return result;
  let fatal = false;
  try {
    await withSchedulingClient(account.session_ciphertext, async client => {
      for (const item of options) {
        if (result.scheduled >= Math.min(limit, MAX_PER_RUN) || fatal) break;
        if (Date.now() + MIN_FUTURE_MS >= Date.parse(item.scheduledAt)) continue;
        // Refresh the server-controlled status: pause must stop new Telegram calls.
        const { data: fresh } = await store.from('nashra_recurring_rules').select('status').eq('id',rule.id).single();
        if (fresh?.status !== 'active') break;
        const { data: found, error: lookupErr } = await store.from('delivery_queue').select('id')
          .eq('user_id',rule.user_id).eq('job_key',item.key).maybeSingle();
        if (lookupErr) { result.problem = 'Vérification des doublons indisponible.'; break; }
        if (found) { result.existing++; continue; }
        const midnight = new Date(item.scheduledAt).toISOString().slice(0,10);
        const { count, error: countError } = await store.from('delivery_queue').select('id',{ count:'exact', head:true })
          .eq('user_id',rule.user_id).gte('scheduled_at',midnight+'T00:00:00.000Z')
          .lt('scheduled_at',new Date(Date.parse(midnight+'T00:00:00.000Z')+86_400_000).toISOString());
        if (countError) { result.problem = 'Garde-fou quotidien indisponible.'; break; }
        if ((count ?? 0) >= DAILY_CAP) { result.problem = 'Plafond quotidien de sécurité atteint : d’autres groupes ne sont pas encore programmés.'; break; }
        let booking: { id: string; created: boolean };
        try {
          booking = await reserveSendWithOrigin({ userId:rule.user_id, key:item.key,
            announcementId:rule.announcement_id, destinationId:item.target.id, scheduledAt:item.scheduledAt });
        } catch (error) { result.problem = error instanceof Error ? error.message : 'Quota indisponible.'; break; }
        if (!booking.created) { result.existing++; continue; } // Never re-attempt a prior reservation.
        const { data: job, error: insertError } = await store.from('delivery_queue').insert({
          user_id:rule.user_id, job_key:item.key, campaign_id:rule.id,
          announcement_id:rule.announcement_id, destination_id:item.target.id,
          scheduled_at:item.scheduledAt, method:'repost', status:'processing', attempted_at:new Date().toISOString(),
        }).select('id').single();
        if (insertError || !job) {
          await finalizeSend(rule.user_id,booking.id,'released');
          result.problem = 'File d’attente indisponible ou limite de programmations atteinte.';
          break;
        }
        try {
          // Telegram receives a distinct native schedule per group. The 90-second
          // stagger applies to DELIVERY time, not just the order of these calls.
          const ids = await scheduleOnConnectedTelegram(client,item.work,item.scheduledAt,album);
          const { error: saveError } = await store.from('delivery_queue').update({ status:'telegram_scheduled',
            telegram_scheduled_ids:ids, telegram_message_id:ids[0], last_error:null,
            updated_at:new Date().toISOString() }).eq('id',job.id).eq('status','processing');
          if (saveError) throw saveError;
          result.scheduled++;
          await new Promise(resolve => setTimeout(resolve, 450));
        } catch (error) {
          // Telegram may have accepted a request even if the HTTP response timed out.
          // Never re-send it automatically or mark it "sent".
          const reason = safeReason(error);
          await store.from('delivery_queue').update({ status:'needs_review', last_error:reason,
            finished_at:new Date().toISOString(),updated_at:new Date().toISOString() })
            .eq('id',job.id).eq('status','processing');
          await finalizeSend(rule.user_id,booking.id,'uncertain');
          result.problem = 'Réponse Telegram incertaine : vérifiez le groupe et reprenez manuellement. ' + reason;
          fatal = true;
          await markRule(rule.id,'paused',result.problem);
        }
      }
    });
  } catch (error) {
    result.problem = 'Session Telegram indisponible : ' + safeReason(error);
    await markRule(rule.id,'paused',result.problem);
  }
  if (result.problem && !fatal) await store.from('nashra_recurring_rules').update({
    last_problem: result.problem, updated_at:new Date().toISOString() }).eq('id',rule.id);
  else if (result.scheduled) await store.from('nashra_recurring_rules').update({
    last_problem: null, updated_at:new Date().toISOString() }).eq('id',rule.id).eq('status','active');
  return result;
}

export async function cancelRecurringFuture(rule: RecurringRule, workspace: AppData, session: string) {
  const store = db();
  const { data: rows, error } = await store.from('delivery_queue')
    .select('id,destination_id,scheduled_at,telegram_scheduled_ids,job_key,status')
    .eq('user_id',rule.user_id).eq('campaign_id',rule.id).eq('status','telegram_scheduled')
    .gt('scheduled_at',new Date().toISOString()).limit(501);
  if (error || !rows || rows.length > 500) throw new DeliveryBlocked('Impossible de charger toutes les programmations à annuler.');
  const failures: string[] = [];
  for (const row of rows) {
    if (Date.parse(row.scheduled_at) <= Date.now()+30_000) {
      failures.push(row.destination_id); // Too close to safely cancel.
      continue;
    }
    const dest = workspace.destinations.find(d => d.id === row.destination_id);
    if (!dest?.handle) { failures.push(row.destination_id); continue; }
    try {
      await cancelTelegramSchedule(session,dest.handle,row.telegram_scheduled_ids as number[] || []);
      const { error: updateError } = await store.from('delivery_queue').update({ status:'cancelled',
        finished_at:new Date().toISOString(),updated_at:new Date().toISOString() }).eq('id',row.id).eq('status','telegram_scheduled');
      if (updateError) throw updateError;
      const { data: reservation } = await store.from('nashra_send_reservations').select('id,status')
        .eq('user_id',rule.user_id).eq('idempotency_key',row.job_key).maybeSingle();
      if (reservation?.status === 'reserved') await finalizeSend(rule.user_id,reservation.id,'released');
    } catch { failures.push(row.destination_id); }
  }
  return { cancelled:rows.length-failures.length, failures:failures.length };
}

/** Can be run by a daily authenticated free-tier cron. Always pre-schedule days ahead. */
export async function refillRecurringRules(): Promise<{ rules: number; scheduled: number; warnings: number }> {
  const store = db();
  // Expired Telegram schedules are NOT proof that Telegram delivered the message.
  // Free pending slots while preserving an explicit review status in history.
  const { error: expireError } = await store.from('delivery_queue').update({
    status:'needs_review', last_error:'Heure passée : livraison Telegram à vérifier.',
    finished_at:new Date().toISOString(),updated_at:new Date().toISOString(),
  }).like('job_key','recurring:%').eq('status','telegram_scheduled')
    .lt('scheduled_at',new Date(Date.now()-15*60_000).toISOString());
  if (expireError) throw new Error('Réconciliation des programmations indisponible.');
  const { data: rules, error } = await store.from('nashra_recurring_rules').select('*')
    .eq('status','active').order('updated_at',{ascending:true}).limit(10);
  if (error) throw new Error('Règles récurrentes indisponibles : SQL 018 requis.');
  let scheduled = 0, warnings = 0, checked = 0;
  const started = Date.now();
  for (const row of (rules ?? []) as RecurringRule[]) {
    if (Date.now()-started > 42_000) break;
    const result = await fillRecurringRule(row,12);
    checked++;
    scheduled += result.scheduled;
    if (result.problem) warnings++;
  }
  return { rules:checked, scheduled, warnings };
}
