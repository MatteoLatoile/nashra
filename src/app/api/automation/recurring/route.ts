import { NextRequest, NextResponse } from 'next/server';
import { context, getAccount } from '@/lib/telegram-user/core';
import { buildAnnouncementDelivery, getServiceClient, DeliveryBlocked } from '@/lib/automation/worker';
import { checkRecurrence, type IntervalRecurrence } from '@/lib/automation/recurrence';
import { fillRecurringRule, cancelRecurringFuture, recurringMismatch, type RecurringRule } from '@/lib/automation/recurring-service';
import type { AppData, Campaign } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const headers = { 'Cache-Control':'no-store' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sendError = (message: string, code = 400) => NextResponse.json({ error:message }, { status:code, headers });
type Body = { action?: 'create' | 'pause' | 'resume' | 'delete' | 'repair' | 'repair_safe'; confirmed?: boolean;
  campaign?: Partial<Campaign>; campaignId?: string; reviewed?: boolean };

export async function GET(req: NextRequest) {
  try {
    const c = await context(req, false);
    const { data, error } = await c.supabase.from('nashra_recurring_rules')
      .select('id,status,last_problem,updated_at').eq('user_id',c.userId);
    if (error) return sendError('Règles indisponibles : appliquez SQL 018.',500);
    return NextResponse.json({ enabled:process.env.NASHRA_RECURRING_ENABLED === '1' && process.env.NASHRA_DISABLE_ALL_SENDS !== '1',
      rules:data ?? [] }, { headers });
  } catch { return sendError('Connexion requise.',401); }
}

export async function POST(req: NextRequest) {
  try {
    const c = await context(req, true);
    const body = await req.json() as Body;
    // Safe repair never activates a rule or calls Telegram; other writes require approval.
    if (body.action !== 'repair_safe' && body.confirmed !== true) return sendError('Confirmez explicitement cette programmation.');
    const service = getServiceClient();
    const { data: ws, error: wsError } = await c.supabase.from('workspaces')
      .select('data').eq('user_id',c.userId).maybeSingle();
    if (wsError || !ws?.data) throw new DeliveryBlocked('Espace Nashra inaccessible.');
    const previous = ws.data as AppData;
    if (!Array.isArray(previous.campaigns)) throw new DeliveryBlocked('Calendrier invalide.');
    if (body.action === 'create') {
      if (process.env.NASHRA_RECURRING_ENABLED !== '1' || process.env.NASHRA_DISABLE_ALL_SENDS === '1')
        return sendError('Récurrence désactivée sur ce serveur : configurez NASHRA_RECURRING_ENABLED=1.',503);
      const raw = body.campaign;
      if (!raw?.id || !UUID.test(raw.id) || typeof raw.name !== 'string' ||
        !raw.name.trim() || raw.name.length > 90 || raw.method !== 'repost')
        return sendError('Nom ou identifiant de campagne invalide.');
      if (previous.campaigns.some(x => x.id === raw.id)) return sendError('Programmation déjà enregistrée.',409);
      const ads = [...new Set(raw.announcementIds ?? [])];
      const dests = [...new Set(raw.destinationIds ?? [])];
      if (ads.length !== 1 || !dests.length || dests.length > 10 ||
        typeof raw.scheduledAt !== 'string' || !Number.isFinite(Date.parse(raw.scheduledAt)) ||
        new Date(raw.scheduledAt).toISOString() !== raw.scheduledAt ||
        Date.parse(raw.scheduledAt) <= Date.now() + 180_000 ||
        Date.parse(raw.scheduledAt) > Date.now() + 30 * 86_400_000)
        return sendError('Sélectionnez une annonce, 1 à 10 groupes et un départ entre 3 minutes et 30 jours.');
      const recurrence = raw.recurrence as IntervalRecurrence | undefined;
      if (!recurrence || recurrence.mode !== 'interval') return sendError('Récurrence manquante.');
      try { checkRecurrence(recurrence); } catch (e) { return sendError(e instanceof Error ? e.message : 'Récurrence invalide.'); }
      const ad = previous.announcements.find(x => x.id === ads[0]);
      const targets = dests.map(id => previous.destinations.find(d => d.id === id));
      if (!ad || targets.some(d => !d?.authorized || !d.handle || !/^-?\d{3,30}$/.test(d.handle)))
        return sendError('Annonce ou destination introuvable/non autorisée.');
      for (const d of targets) buildAnnouncementDelivery(ad,d!.handle,'repost',c.userId,d!.topicId);
      const account = await getAccount(c);
      if (!account?.session_ciphertext) return sendError('Connectez d’abord votre compte Telegram.');
      const untilDay = recurrence.until || null;
      const firstCivilDay = new Intl.DateTimeFormat('en-CA', { timeZone:recurrence.timeZone,
        year:'numeric',month:'2-digit',day:'2-digit' }).format(new Date(raw.scheduledAt));
      if (untilDay && untilDay < firstCivilDay) return sendError('La date de fin doit être après le début.');
      const campaign: Campaign = {
        id:raw.id, name:raw.name.trim(), announcementId:ads[0], announcementIds:ads,
        destinationIds:dests, destinationTopics:Object.fromEntries(targets.map(d => [d!.id, d!.topicId ?? null])),
        destinationHandles:Object.fromEntries(targets.map(d => [d!.id, d!.handle])),
        method:'repost', scheduledAt:raw.scheduledAt,
        scheduledDates:[raw.scheduledAt], recurrence, nativeTelegram:true,
        status:'scheduled', createdAt:new Date().toISOString(),
      };
      const row = { id:campaign.id, user_id:c.userId, announcement_id:ad.id,
        destination_ids:dests, anchor_at:campaign.scheduledAt, interval_days:recurrence.intervalDays,
        time_zone:recurrence.timeZone, until_day:untilDay, status:'active' as const, last_problem:null };
      const { error: insertError } = await service.from('nashra_recurring_rules').insert(row);
      if (insertError) return sendError('Impossible de créer la règle : appliquez SQL 018 et vérifiez les quotas.',500);
      const next: AppData = { ...previous,campaigns:[campaign,...previous.campaigns] };
      const { error: saveError } = await c.supabase.from('workspaces').update({ data:next }).eq('user_id',c.userId);
      if (saveError) {
        await service.from('nashra_recurring_rules').delete().eq('id',campaign.id).eq('user_id',c.userId);
        return sendError('Impossible de sauvegarder le calendrier. Aucun envoi déclenché.',500);
      }
      const filled = await fillRecurringRule(row as RecurringRule, 12);
      return NextResponse.json({ ok:true,workspace:next,scheduled:filled.scheduled,existing:filled.existing,
        partial:!!filled.problem,warning:filled.problem,
        message:filled.scheduled ? 'Premières diffusions programmées sur Telegram.' :
          'Règle enregistrée, mais aucun message Telegram encore confirmé. Vérifiez le statut.' }, { headers });
    }
    const id = body.campaignId;
    if (!id || !UUID.test(id) || !['pause','resume','delete','repair','repair_safe'].includes(body.action ?? '')) return sendError('Action invalide.');
    const campaign = previous.campaigns.find(x => x.id === id && x.recurrence?.mode === 'interval');
    if (!campaign) return sendError('Récurrence introuvable.',404);
    const { data, error: ruleErr } = await service.from('nashra_recurring_rules')
      .select('*').eq('user_id',c.userId).eq('id',id).maybeSingle();
    if (ruleErr || !data) return sendError('Règle introuvable : migration 018.',404);
    const rule = data as RecurringRule;
    if (body.action === 'repair' || body.action === 'repair_safe') {
      // Restore workspace metadata from the server-side rule only. No Telegram calls,
      // no rule activation, no quota reservations and no future scheduling.
      if (rule.status !== 'paused') return sendError('Mettez d’abord la règle en pause pour la resynchroniser.',409);
      const original = campaign.destinationHandles ?? {};
      const originalTopics = campaign.destinationTopics ?? {};
      const missing = rule.destination_ids.some(destId => {
        const dest = previous.destinations.find(d => d.id === destId);
        return !dest?.authorized || !original[destId] || original[destId] !== dest.handle
          || (originalTopics[destId] ?? null) !== (dest.topicId ?? null);
      });
      if (missing) return sendError('Destination Telegram modifiée ou manquante : réparation automatique bloquée. Vérifiez le groupe et les messages programmés.',409);
      if (!previous.announcements.some(a => a.id === rule.announcement_id))
        return sendError('Annonce originale introuvable : réparation impossible.',409);
      const differences = recurringMismatch(rule,campaign);
      const repaired: Campaign = { ...campaign, status:'paused', announcementId:rule.announcement_id,
        announcementIds:[rule.announcement_id], destinationIds:[...rule.destination_ids],
        scheduledAt:rule.anchor_at, scheduledDates:[rule.anchor_at],
        recurrence:{ mode:'interval', intervalDays:rule.interval_days,
          timeZone:rule.time_zone, until:rule.until_day }, nativeTelegram:true };
      const next: AppData = { ...previous,
        campaigns:previous.campaigns.map(x => x.id === id ? repaired : x) };
      const { error: writeError } = await c.supabase.from('workspaces')
        .update({ data:next }).eq('user_id',c.userId);
      if (writeError) return sendError('Impossible de sauvegarder la synchronisation.',500);
      const { error: clearError } = await service.from('nashra_recurring_rules')
        .update({ last_problem:null, updated_at:new Date().toISOString() })
        .eq('id',id).eq('user_id',c.userId).eq('status','paused');
      if (clearError) return sendError('Campagne resynchronisée, mais le diagnostic de la règle ne peut pas être actualisé.',500);
      return NextResponse.json({ ok:true,workspace:next, repaired:differences,
        partial:true, warning:differences.length
          ? 'Règle resynchronisée, toujours en pause. Vérifiez les messages futurs incertains dans Telegram avant de reprendre.'
          : 'Règle et campagne déjà cohérentes. La règle reste en pause jusqu’à une reprise explicite.'
      },{headers});
    }
    if (body.action === 'resume') {
      if (process.env.NASHRA_RECURRING_ENABLED !== '1' || process.env.NASHRA_DISABLE_ALL_SENDS === '1')
        return sendError('Moteur de récurrence désactivé sur le serveur.',503);
      const differences = recurringMismatch(rule,campaign);
      if (differences.length) return sendError('Règle désynchronisée (' + differences.join(', ') + '). Utilisez « Réparer la règle » avant de reprendre.',409);
      const { count: unsafeFuture, error: futureError } = await service.from('delivery_queue')
        .select('id',{head:true,count:'exact'}).eq('user_id',c.userId).eq('campaign_id',id)
        .in('status',['needs_review','processing'])
        .gt('scheduled_at',new Date().toISOString());
      if (futureError) return sendError('Impossible de vérifier les envois futurs : reprise bloquée.',503);
      if ((unsafeFuture ?? 0) > 0) return sendError('Des envois futurs restent incertains. Vérifiez ou annulez-les dans Telegram avant toute reprise. Une confirmation générale ne suffit pas.',409);
      const { count } = await service.from('delivery_queue').select('id',{head:true,count:'exact'})
        .eq('user_id',c.userId).eq('campaign_id',id).eq('status','needs_review');
      if ((count ?? 0) > 0 && body.reviewed !== true) return sendError('Vérifiez d’abord les messages incertains dans Telegram avant de reprendre.',409);
      const next: AppData = { ...previous,campaigns:previous.campaigns.map(x => x.id === id ? {...x,status:'scheduled' as const} : x) };
      const { error: change } = await c.supabase.from('workspaces').update({ data:next }).eq('user_id',c.userId);
      if (change) return sendError('Sauvegarde impossible.',500);
      await service.from('nashra_recurring_rules').update({ status:'active',last_problem:null,
        updated_at:new Date().toISOString() }).eq('id',id).eq('user_id',c.userId);
      const filled = await fillRecurringRule({...rule,status:'active'},12);
      return NextResponse.json({ ok:true,workspace:next,scheduled:filled.scheduled,
        partial:!!filled.problem,warning:filled.problem }, { headers });
    }
    // Stop future refill BEFORE calling Telegram. If a cancellation fails,
    // the rule remains paused and the exact future delivery is flagged.
    const { error: pauseErr } = await service.from('nashra_recurring_rules').update({ status:'paused',
      updated_at:new Date().toISOString() }).eq('id',id).eq('user_id',c.userId);
    if (pauseErr) return sendError('Pause serveur impossible.',500);
    const paused: AppData = { ...previous,campaigns:previous.campaigns.map(x => x.id === id ? {...x,status:'paused' as const}:x) };
    const { error: wsWrite } = await c.supabase.from('workspaces').update({ data:paused }).eq('user_id',c.userId);
    if (wsWrite) return sendError('Règle interrompue côté serveur, mais mise à jour du calendrier échouée. Actualisez.',500);
    const account = await getAccount(c);
    if (!account?.session_ciphertext) return NextResponse.json({ ok:true,workspace:paused,partial:true,
      warning:'Règle en pause. Connectez Telegram pour annuler les messages déjà programmés.' }, { headers });
    let canceled: Awaited<ReturnType<typeof cancelRecurringFuture>>;
    try {
      canceled = await cancelRecurringFuture(rule,previous,account.session_ciphertext);
    } catch {
      return NextResponse.json({ ok:true,workspace:paused,partial:true,
        warning:'La répétition est arrêtée dans Nashra, mais l’annulation Telegram n’a pas pu être vérifiée. Contrôlez les messages programmés dans Telegram avant toute nouvelle action.' },{headers});
    }
    const { count: ongoing } = await service.from('delivery_queue').select('id',{head:true,count:'exact'})
      .eq('user_id',c.userId).eq('campaign_id',id).eq('status','processing');
    if ((ongoing ?? 0) > 0) return NextResponse.json({ok:true,workspace:paused,partial:true,
      cancelled:canceled.cancelled,
      warning:'Une programmation est encore en cours. La règle est en pause ; revérifiez dans Telegram puis relancez l’annulation.'},{headers});
    if (canceled.failures || canceled.unverified) return NextResponse.json({ ok:true,workspace:paused,partial:true,
      warning:`Arrêt côté Nashra effectué, mais ${canceled.failures} annulation(s) Telegram non confirmée(s) et ${canceled.unverified} envoi(s) futur(s) incertain(s). Vérifiez Telegram avant de supprimer ou reprendre.`,
      cancelled:canceled.cancelled,unverified:canceled.unverified },{headers});
    if (body.action === 'delete') {
      const next = { ...paused,campaigns:paused.campaigns.filter(x => x.id !== id) };
      const { error: deleteWsErr } = await c.supabase.from('workspaces').update({ data:next }).eq('user_id',c.userId);
      if (deleteWsErr) return sendError('Messages annulés ; impossible de retirer la carte. Actualisez.',500);
      const { error: removeErr } = await service.from('nashra_recurring_rules').delete().eq('user_id',c.userId).eq('id',id);
      if (removeErr) return sendError('Les envois ont été annulés, mais la suppression de la règle a échoué. Actualisez.',500);
      return NextResponse.json({ ok:true,workspace:next,cancelled:canceled.cancelled },{headers});
    }
    return NextResponse.json({ ok:true,workspace:paused,cancelled:canceled.cancelled },{headers});
  } catch (error) {
    return sendError(error instanceof DeliveryBlocked ? error.message :
      'Opération indisponible. Vérifiez SQL 018, les quotas et Telegram.',error instanceof DeliveryBlocked?400:500);
  }
}
