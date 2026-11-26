/** Server-side rolling window of Telegram-native schedules for interval rules. */
import 'server-only';
import type { AppData, Campaign } from '@/lib/store';
import { buildAnnouncementDelivery, getServiceClient, loadAlbum, loadVideo, safeReason, DeliveryBlocked } from './worker';
import { recurringOccurrences, destinationSendAt, type IntervalRecurrence } from './recurrence';
import { cancelTelegramSchedule, scheduleOnConnectedTelegram, withSchedulingClient } from './telegram-native';
import { reserveSendWithOrigin, finalizeSend } from '@/lib/billing/quotas-server';
import { listDialogsRaw } from '@/lib/telegram-user/core';
import { findPublishedText } from './published-proof';
import { queueNotification, sessionFingerprint } from '@/lib/email/notifications';

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
    && c.announcementId === rule.announcement_id && Date.parse(c.scheduledAt) === Date.parse(rule.anchor_at)
    && c.recurrence.intervalDays === rule.interval_days && c.recurrence.timeZone === rule.time_zone
    && JSON.stringify(c.destinationIds) === JSON.stringify(rule.destination_ids);
}

/** Compare immutable server rule and workspace campaign; never silently rewrite the rule. */
export function recurringMismatch(rule: RecurringRule, c: Campaign | undefined): string[] {
  if (!c) return ['campagne absente'];
  const reasons: string[] = [];
  const interval = c.recurrence?.mode === 'interval' ? c.recurrence : null;
  if (!interval) reasons.push('répétition absente');
  if (c.announcementId !== rule.announcement_id) reasons.push('annonce différente');
  if (Date.parse(c.scheduledAt) !== Date.parse(rule.anchor_at)) reasons.push('date de départ différente');
  if (interval?.intervalDays !== rule.interval_days) reasons.push('intervalle différent');
  if (interval?.timeZone !== rule.time_zone) reasons.push('fuseau horaire différent');
  if ((interval?.until || null) !== (rule.until_day || null)) reasons.push('date de fin différente');
  if (JSON.stringify(c.destinationIds) !== JSON.stringify(rule.destination_ids)) reasons.push('destinations différentes');
  return reasons;
}

export type FillResult = { scheduled: number; existing: number; problem: string | null };
export async function fillRecurringRule(rule: RecurringRule, limit = MAX_PER_RUN): Promise<FillResult> {
  const result: FillResult = { scheduled: 0, existing: 0, problem: null };
  if (rule.status !== 'active' || process.env.NASHRA_DISABLE_ALL_SENDS === '1' || process.env.NASHRA_RECURRING_ENABLED !== '1') return result;
  const retryAt = rule.last_problem?.match(/^Reprise automatique après (\S+)/)?.[1];
  if (retryAt && Date.parse(retryAt)>Date.now()) return {...result,problem:rule.last_problem};
  const store = db();
  const [{ data: ws, error: wsError }, { data: account, error: accError }] = await Promise.all([
    store.from('workspaces').select('data').eq('user_id',rule.user_id).maybeSingle(),
    store.from('telegram_accounts').select('session_ciphertext').eq('user_id',rule.user_id).maybeSingle(),
  ]);
  const data = ws?.data as AppData | undefined;
  const campaign = data?.campaigns?.find(c => c.id === rule.id);
  if (wsError || accError) {
    // No Telegram call has been made. A later cron may retry the read.
    result.problem = 'Lecture temporairement indisponible. Nashra réessaiera au prochain passage.';
    return result;
  }
  if (!data || !matches(rule,campaign) || !data.announcements || !data.destinations) {
    result.problem = wsError || !data ? 'Espace de travail indisponible : programmation suspendue.' : 'Règle et campagne désynchronisées (' + recurringMismatch(rule,campaign).join(', ') + '). Programmation suspendue.';
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
  if (targets.some(target => campaign?.destinationHandles?.[target.id] && campaign?.destinationHandles?.[target.id] !== target.handle)) {
    result.problem = 'Groupe Telegram modifié : annulez les anciennes programmations avant de reprendre.';
    await markRule(rule.id, 'paused', result.problem);
    return result;
  }
  if (targets.some(target => { const snapshot = campaign?.destinationTopics?.[target.id];
    return (snapshot !== undefined || target.topicId !== undefined) && snapshot !== (target.topicId ?? null); })) {
    result.problem = 'Sujet Telegram modifié : annulez les anciennes programmations puis créez une nouvelle campagne.';
    await markRule(rule.id, 'paused', result.problem);
    return result;
  }
  let works: ReturnType<typeof buildAnnouncementDelivery>[];
  let album: Buffer[] | undefined;
  try {
    works = targets.map(target => buildAnnouncementDelivery(announcement, target.handle, 'repost', rule.user_id, target.topicId));
    album = works[0].kind === 'album' ? await loadAlbum(store, works[0].photos) : works[0].kind === 'video' ? [await loadVideo(store, works[0].video)] : undefined;
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
  let connected = false;
  try {
    await withSchedulingClient(account.session_ciphertext, async client => {
      connected = true;
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
        // A pause can land between the first rule check and insertion of the job.
        // Once this row exists, cancellation also sees it as in progress.
        const gate=await store.from('nashra_recurring_rules').select('status').eq('user_id',rule.user_id).eq('id',rule.id).maybeSingle();
        if (gate.error || gate.data?.status!=='active') {
          const stopped=await store.from('delivery_queue').update({status:'cancelled',updated_at:new Date().toISOString()})
            .eq('id',job.id).eq('user_id',rule.user_id).eq('status','processing').select('id').maybeSingle();
          if(stopped.data && !stopped.error) await finalizeSend(rule.user_id,booking.id,'released');
          break;
        }
        try {
          // Telegram receives a distinct native schedule per group. The 90-second
          // stagger applies to DELIVERY time, not just the order of these calls.
          const ids = await scheduleOnConnectedTelegram(client,item.work,item.scheduledAt,album);
          const {data:confirmed,error:saveError} = await store.from('delivery_queue').update({ status:'telegram_scheduled',
            telegram_scheduled_ids:ids, telegram_message_id:ids[0], last_error:null,
            updated_at:new Date().toISOString() }).eq('id',job.id).eq('status','processing').select('id').maybeSingle();
          if (saveError || !confirmed) throw new Error('Confirmation indisponible.');
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
    // Only connection/setup failures before entering the publishing callback qualify.
    const message=error instanceof Error?error.message:'';
    const wait=message.match(/(?:FLOOD_WAIT_|SLOWMODE_WAIT_)(\d+)/i);
    const seconds=Number((error as {seconds?:number})?.seconds ?? wait?.[1] ?? 0);
    if (!connected && (wait || /TIMEOUT|ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN|FloodWait/i.test(message))) {
      const delay=Math.max(300, Number.isFinite(seconds)?seconds:0);
      if(delay < 315360000) {
        result.problem='Reprise automatique après '+new Date(Date.now()+delay*1000).toISOString();
        await store.from('nashra_recurring_rules').update({last_problem:result.problem,updated_at:new Date().toISOString()})
          .eq('id',rule.id).eq('user_id',rule.user_id).eq('status','active');
        return result;
      }
    }
    result.problem = 'Session Telegram indisponible : ' + safeReason(error);
    await markRule(rule.id,'paused',result.problem);
    if (/AUTH_KEY_UNREGISTERED|SESSION_REVOKED|AUTH_KEY_INVALID|Session Telegram expirée/i.test(message)
        && account?.session_ciphertext) {
      try {
        const fp=sessionFingerprint(account.session_ciphertext);
        await queueNotification(rule.user_id,'telegram_reconnect',`telegram-expired:${rule.user_id}:${fp}`,{sessionFingerprint:fp});
      } catch { console.error('[NASHRA_EMAIL] Telegram recurring disconnection not queued'); }
    }
  }
  if (result.problem && !fatal) await store.from('nashra_recurring_rules').update({
    last_problem: result.problem, updated_at:new Date().toISOString() }).eq('id',rule.id);
  else if (result.scheduled) await store.from('nashra_recurring_rules').update({
    last_problem: null, updated_at:new Date().toISOString() }).eq('id',rule.id).eq('status','active');
  return result;
}

export async function cancelRecurringFuture(rule: RecurringRule, workspace: AppData, session: string) {
  const store = db();
  // Include uncertain/in-flight future requests. They cannot be safely erased from
  // Telegram without confirmed native IDs, so report them rather than claiming success.
  const { data: rows, error } = await store.from('delivery_queue')
    .select('id,destination_id,scheduled_at,telegram_scheduled_ids,job_key,status')
    .eq('user_id',rule.user_id).eq('campaign_id',rule.id)
    .in('status',['telegram_scheduled','needs_review','processing'])
    .gt('scheduled_at',new Date().toISOString()).limit(501);
  if (error || !rows || rows.length > 500) throw new DeliveryBlocked('Impossible de charger toutes les programmations à annuler.');
  const unverified = rows.filter(row => row.status !== 'telegram_scheduled').length;
  const pending = rows.filter(row => row.status === 'telegram_scheduled');
  const campaign = workspace.campaigns.find(c => c.id === rule.id);
  const failures: string[] = [];
  for (const row of pending) {
    if (Date.parse(row.scheduled_at) <= Date.now()+30_000) {
      failures.push(row.destination_id); // Too close to safely cancel.
      continue;
    }
    // Destination IDs are mutable. Only the immutable chat ID captured when the
    // campaign was created may be used for deletion of existing Telegram messages.
    const originalChatId = campaign?.destinationHandles?.[row.destination_id];
    if (!originalChatId || !/^-?\d{3,30}$/.test(originalChatId)) {
      failures.push(row.destination_id);
      continue;
    }
    try {
      await cancelTelegramSchedule(session,originalChatId,row.telegram_scheduled_ids as number[] || []);
      if (Date.parse(row.scheduled_at)<=Date.now()+5_000) throw new Error('Annulation trop proche du départ.');
      const {data:cancelled,error:updateError} = await store.from('delivery_queue').update({ status:'cancelled',
        finished_at:new Date().toISOString(),updated_at:new Date().toISOString() })
        .eq('id',row.id).eq('user_id',rule.user_id).eq('status','telegram_scheduled').select('id').maybeSingle();
      if (updateError || !cancelled) throw new Error('Annulation non confirmée.');
      const { data: reservation } = await store.from('nashra_send_reservations').select('id,status')
        .eq('user_id',rule.user_id).eq('idempotency_key',row.job_key).maybeSingle();
      if (reservation?.status === 'reserved') await finalizeSend(rule.user_id,reservation.id,'released');
    } catch { failures.push(row.destination_id); }
  }
  return { cancelled: pending.length - failures.length, failures: failures.length, unverified };
}

/** Reconcile recent Telegram-native schedules against outgoing chat history.
 * No Telegram send, no inferred delivery from absence and no rule reactivation.
 * Keep this bounded: the same cron must still have time to refill future dates.
 */
async function reconcilePublishedRecurringJobs() {
  const store=db();
  const now=Date.now();
  const {data:rows,error}=await store.from('delivery_queue')
    .select('id,user_id,campaign_id,announcement_id,destination_id,scheduled_at,status')
    .like('job_key','recurring:%')
    .in('status',['telegram_scheduled','needs_review'])
    .lt('scheduled_at',new Date(now-90_000).toISOString())
    .gt('scheduled_at',new Date(now-7*86_400_000).toISOString())
    .order('scheduled_at',{ascending:false}).limit(14);
  if(error || !rows?.length)return;
  const byUser=new Map<string,typeof rows>();
  for(const row of rows){const batch=byUser.get(row.user_id)??[];batch.push(row);byUser.set(row.user_id,batch);}
  for(const [userId,userRows] of [...byUser].slice(0,3)){
    const [ws,account]=await Promise.all([
      store.from('workspaces').select('data').eq('user_id',userId).maybeSingle(),
      store.from('telegram_accounts').select('session_ciphertext').eq('user_id',userId).maybeSingle(),
    ]);
    if(ws.error||account.error||!ws.data?.data||!account.data?.session_ciphertext)continue;
    const workspace=ws.data.data as AppData;
    try{
      await withSchedulingClient(account.data.session_ciphertext,async client=>{
        const dialogs=new Map((await listDialogsRaw(client)).map(d=>[d.id,d.entity]));
        for(const row of userRows){
          const campaign=workspace.campaigns?.find(c=>c.id===row.campaign_id);
          const peerId=campaign?.destinationHandles?.[row.destination_id];
          const ad=workspace.announcements?.find(a=>a.id===row.announcement_id);
          const body=ad?.body?.trim();
          if(!peerId||!body||ad?.imageUrls?.length||ad?.videoUrl)continue;
          const entity=dialogs.get(peerId);
          if(!entity)continue;
          try{
            const peer=await client.getInputEntity(entity);
            const publishedId=await findPublishedText(client,peer,body,row.scheduled_at,campaign?.destinationTopics?.[row.destination_id]??undefined);
            if(!publishedId)continue;
            await store.from('delivery_queue').update({
              status:'sent',telegram_message_id:publishedId,
              last_error:'Publication confirmée dans l’historique Telegram.',
              finished_at:new Date().toISOString(),updated_at:new Date().toISOString(),
            }).eq('id',row.id).eq('user_id',userId).eq('status',row.status);
          }catch{ /* Absence de preuve : conserver le statut sans republier. */ }
        }
      });
    }catch{ /* Un compte inaccessible ne doit pas bloquer les autres campagnes. */ }
  }
}

/** Can be run by a daily authenticated free-tier cron. Always pre-schedule days ahead. */
export async function refillRecurringRules(): Promise<{ rules: number; scheduled: number; warnings: number }> {
  const store = db();
  // First search for POSITIVE proof in the actual published history. A message
  // disappearing from scheduled history is normal after delivery, not an error.
  await reconcilePublishedRecurringJobs();
  // Only unresolved schedules older than one day require a human check. The
  // conservative fallback also frees stale quota slots without claiming success.
  const { error: expireError } = await store.from('delivery_queue').update({
    status:'needs_review', last_error:'Publication ancienne : Nashra n’a pas pu confirmer sa livraison dans Telegram.',
    finished_at:new Date().toISOString(),updated_at:new Date().toISOString(),
  }).like('job_key','recurring:%').eq('status','telegram_scheduled')
    .lt('scheduled_at',new Date(Date.now()-24*60*60_000).toISOString());
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
