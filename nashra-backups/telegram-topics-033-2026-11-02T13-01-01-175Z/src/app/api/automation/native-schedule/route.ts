/** Native Telegram schedule: messages are delivered by Telegram even with PC off. */
import { NextRequest, NextResponse } from 'next/server';
import { context, getAccount } from '@/lib/telegram-user/core';
import { buildAnnouncementDelivery, getServiceClient, loadAlbum, safeReason, DeliveryBlocked } from '@/lib/automation/worker';
import { scheduleWithTelegram, cancelTelegramSchedule } from '@/lib/automation/telegram-native';
import type { Campaign, AppData } from '@/lib/store';
import { reserveSendWithOrigin, finalizeSend } from '@/lib/billing/quotas-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const headers = { 'Cache-Control': 'no-store' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Raw = { action?: 'schedule' | 'cancel'; confirmed?: boolean; campaign?: Partial<Campaign>; campaignId?: string };
const errorResponse = (error: string, status = 400) => NextResponse.json({ error }, { status, headers });

async function cancel(c: Awaited<ReturnType<typeof context>>, campaignId: string) {
  const service = getServiceClient();
  const { data: workspace, error: wsError } = await c.supabase.from('workspaces').select('data').eq('user_id', c.userId).maybeSingle();
  if (wsError || !workspace?.data) throw new DeliveryBlocked('Espace utilisateur introuvable.');
  const previous = workspace.data as AppData;
  const campaign = previous.campaigns?.find(x => x.id === campaignId && x.nativeTelegram === true);
  if (!campaign) throw new DeliveryBlocked('Programmation Telegram introuvable.');
  const { data: jobs, error: listError } = await service.from('delivery_queue')
    .select('id,destination_id,scheduled_at,status,telegram_scheduled_ids')
    .eq('user_id', c.userId).eq('campaign_id', campaignId).limit(20);
  if (listError) throw new DeliveryBlocked('File inaccessible : migration 013 requise.');
  if ((jobs ?? []).some(x => ['processing','needs_review'].includes(x.status)))
    throw new DeliveryBlocked('Certaines programmations ont un résultat incertain. Vérifiez directement dans Telegram avant toute suppression.');
  const active = (jobs ?? []).filter(x => x.status === 'telegram_scheduled');
  if (active.some(x => Date.parse(x.scheduled_at) <= Date.now() + 5_000))
    throw new DeliveryBlocked('Le créneau est déjà passé ou trop proche : vérifiez Telegram avant d’annuler.');
  const account = await getAccount(c);
  if (!account?.session_ciphertext) throw new DeliveryBlocked('Reconnectez votre compte Telegram pour annuler.');
  let errors = 0;
  for (const job of active) {
    const dest = previous.destinations.find(x => x.id === job.destination_id);
    try {
      if (!dest?.handle) throw new DeliveryBlocked('Groupe supprimé : annulation manuelle dans Telegram nécessaire.');
      await cancelTelegramSchedule(account.session_ciphertext, dest.handle, job.telegram_scheduled_ids as number[] || []);
      const { error } = await service.from('delivery_queue').update({ status: 'cancelled', finished_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', job.id).eq('user_id', c.userId).eq('status', 'telegram_scheduled');
      if (error) throw error;
      const { data: booking } = await service.from('nashra_send_reservations').select('id,status')
        .eq('user_id',c.userId).eq('idempotency_key',`native:${campaignId}:${job.destination_id}`).maybeSingle();
      if (booking && booking.status === 'reserved') await finalizeSend(c.userId, booking.id, 'released');
    } catch { errors++; }
  }
  if (errors) return errorResponse(`${errors} annulation(s) non confirmée(s). Vérifiez les messages programmés directement dans Telegram.`, 409);
  const next: AppData = { ...previous, campaigns: previous.campaigns.filter(x => x.id !== campaignId) };
  const { error: saveError } = await c.supabase.from('workspaces').update({ data: next }).eq('user_id', c.userId);
  if (saveError) return errorResponse('Telegram a annulé les messages, mais le calendrier Nashra ne s’est pas actualisé. Rechargez la page.', 500);
  return NextResponse.json({ ok: true, workspace: next, cancelled: active.length }, { headers });
}

export async function POST(req: NextRequest) {
  try {
    const c = await context(req, true);
    const body = await req.json() as Raw;
    if (body.confirmed !== true) return errorResponse('Confirmez explicitement cette action.');
    if (body.action === 'cancel') {
      if (!body.campaignId || !UUID.test(body.campaignId)) return errorResponse('Programmation invalide.');
      return await cancel(c, body.campaignId);
    }
    if (body.action !== 'schedule' || !body.campaign) return errorResponse('Action de programmation invalide.');
    if (process.env.NASHRA_DISABLE_ALL_SENDS === '1') return errorResponse('Publications suspendues par la configuration du serveur.', 503);
    const raw = body.campaign;
    if (!raw.id || !UUID.test(raw.id) || !raw.name || raw.name.trim().length < 1 || raw.name.length > 90)
      return errorResponse('Nom ou identifiant invalide.');
    const ads = [...new Set(raw.announcementIds ?? [])];
    const dests = [...new Set(raw.destinationIds ?? [])];
    const slots = [...new Set(raw.scheduledDates ?? [])];
    if (ads.length !== 1 || !dests.length || dests.length > 5 || slots.length !== 1 || raw.method !== 'repost')
      return errorResponse('Choisissez une annonce, une date et jusqu’à 5 groupes autorisés.');
    const when = slots[0];
    const epoch = Date.parse(when);
    if (!Number.isFinite(epoch) || new Date(epoch).toISOString() !== when || epoch <= Date.now() + 180_000 || epoch > Date.now() + 90 * 86400_000)
      return errorResponse('Choisissez une date entre 3 minutes et 90 jours dans le futur.');
    const { data: record, error: readError } = await c.supabase.from('workspaces').select('data').eq('user_id', c.userId).maybeSingle();
    if (readError || !record?.data) throw new DeliveryBlocked('Espace Nashra inaccessible.');
    const previous = record.data as AppData;
    if (previous.campaigns.some(x => x.id === raw.id)) return errorResponse('Programmation déjà enregistrée.', 409);
    const ad = previous.announcements.find(x => x.id === ads[0]);
    const targetDestinations = dests.map(id => previous.destinations.find(x => x.id === id));
    if (!ad || targetDestinations.some(x => !x?.authorized || !x.handle || !/^-?\d{3,30}$/.test(x.handle)))
      return errorResponse('Annonce introuvable ou groupe non autorisé.');
    const targets = targetDestinations.filter((x): x is NonNullable<typeof x> => Boolean(x));
    const tasks = targets.map(target => ({ target, work: buildAnnouncementDelivery(ad, target.handle, 'repost', c.userId) }));
    const account = await getAccount(c);
    if (!account?.session_ciphertext) return errorResponse('Connectez votre compte Telegram personnel.');
    const service = getServiceClient();
    const firstTask = tasks[0];
    const album = firstTask.work.kind === 'album' ? await loadAlbum(service, firstTask.work.photos) : undefined;
    const campaign: Campaign = {
      id: raw.id, name: raw.name.trim(), announcementId: ads[0], announcementIds: ads,
      destinationIds: dests, method: 'repost', scheduledAt: when, scheduledDates: [when],
      status: 'scheduled', nativeTelegram: true, createdAt: new Date().toISOString(),
    };
    const bookings = new Map<string,{id:string;created:boolean}>();
    try {
      for (const task of tasks) {
        const booked = await reserveSendWithOrigin({ userId: c.userId,
          key: `native:${campaign.id}:${task.target.id}`, announcementId: ad.id,
          destinationId: task.target.id, scheduledAt: when });
        bookings.set(task.target.id, booked);
      }
    } catch (err) {
      for (const booking of bookings.values()) if (booking.created) await finalizeSend(c.userId, booking.id, 'released');
      throw err;
    }
    if ([...bookings.values()].some(x => !x.created)) {
      for (const b of bookings.values()) if (b.created) await finalizeSend(c.userId,b.id,'released');
      return errorResponse('Programmation déjà réservée. Vérifiez Telegram et l’historique avant de réessayer.',409);
    }
    const jobPayload = tasks.map(({target}) => ({ user_id: c.userId, job_key: `tg-native:${campaign.id}:${target.id}`,
      campaign_id: campaign.id, announcement_id: ad.id, destination_id: target.id,
      scheduled_at: when, method: 'repost', status: 'processing', attempted_at: new Date().toISOString() }));
    const { data: reserved, error: reserveError } = await service.from('delivery_queue').insert(jobPayload)
      .select('id,destination_id');
    if (reserveError || !reserved || reserved.length !== tasks.length) {
      for (const booking of bookings.values()) if (booking.created) await finalizeSend(c.userId, booking.id, 'released');
      if (reserveError && /23505|duplicate|unique/i.test(reserveError.message))
        return errorResponse('Programmation déjà demandée. Consultez le calendrier et l’historique.', 409);
      return errorResponse('Réservation impossible. Exécutez supabase/013_telegram_native.sql, puis réessayez.', 500);
    }
    const next: AppData = { ...previous, campaigns: [campaign, ...previous.campaigns] };
    const { error: saveError } = await c.supabase.from('workspaces').update({ data: next }).eq('user_id', c.userId);
    if (saveError) {
      await service.from('delivery_queue').update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('user_id', c.userId).eq('campaign_id', campaign.id).eq('status','processing');
      for (const booking of bookings.values()) if (booking.created) await finalizeSend(c.userId, booking.id, 'released');
      return errorResponse('Impossible de sauvegarder le calendrier : aucun envoi demandé à Telegram.', 500);
    }
    let scheduled = 0;
    const attempted = new Set<string>();
    const errors: string[] = [];
    for (const task of tasks) {
      const row = reserved.find(j => j.destination_id === task.target.id);
      if (!row) continue;
      try {
        // A request can have reached Telegram even if the API subsequently errors.
        attempted.add(task.target.id);
        const ids = await scheduleWithTelegram(account.session_ciphertext, task.work, when, album);
        const { error } = await service.from('delivery_queue').update({ status: 'telegram_scheduled',
          telegram_scheduled_ids: ids, telegram_message_id: ids[0], last_error: null,
          updated_at: new Date().toISOString() }).eq('id', row.id).eq('user_id', c.userId).eq('status','processing');
        if (error) throw error;
        scheduled++;
      } catch (err) {
        const reason = safeReason(err);
        const status = err instanceof DeliveryBlocked ? 'blocked' : 'needs_review';
        await service.from('delivery_queue').update({ status, last_error: reason,
          finished_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', row.id).eq('user_id', c.userId).eq('status','processing');
        await finalizeSend(c.userId, bookings.get(task.target.id)!.id, status === 'blocked' ? 'released' : 'uncertain');
        errors.push(task.target.name + ': ' + reason);
        // Avoid a burst or accidental partial album when one destination fails.
        break;
      }
    }
    if (scheduled !== tasks.length) {
      // Unattempted destinations never touched Telegram: release only these.
      for (const task of tasks) {
        if (!attempted.has(task.target.id) && bookings.get(task.target.id)?.created)
          await finalizeSend(c.userId, bookings.get(task.target.id)!.id, 'released');
      }
      await service.from('delivery_queue').update({ status: 'blocked', last_error: 'Non envoyé : programmation interrompue après une erreur.',
        finished_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('user_id', c.userId).eq('campaign_id', campaign.id).eq('status','processing');
    }
    return NextResponse.json({ ok: scheduled > 0, workspace: next, scheduled,
      automationEnabled: true, partial: scheduled !== tasks.length,
      error: errors.join(' ') || (scheduled ? '' : 'Aucune programmation confirmée par Telegram.') },
      { status: scheduled > 0 ? 200 : 409, headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Programmation impossible : vérifiez Supabase et la connexion Telegram.';
    return errorResponse(message, err instanceof DeliveryBlocked ? 400 : 500);
  }
}
