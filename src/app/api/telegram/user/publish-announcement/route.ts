/** One explicitly confirmed, user-owned Telegram destination per request. */
import { NextRequest, NextResponse } from 'next/server';
import { context, getAccount } from '@/lib/telegram-user/core';
import { buildAnnouncementDelivery, getServiceClient, loadAlbum, sendWithPersonalAccount, safeReason, DeliveryBlocked } from '@/lib/automation/worker';
import { reserveSend, finalizeSend } from '@/lib/billing/quotas-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  let recorded = false;
  let jobId = '';
  let reservationId = '';
  let service: ReturnType<typeof getServiceClient> | null = null;
  try {
    // A deliberate confirmed user click is enough for manual publishing.
    if (process.env.NASHRA_DISABLE_ALL_SENDS === '1')
      return NextResponse.json({ error: 'Publications suspendues par l’administrateur.' }, { status: 503, headers: noStore });
    const c = await context(req, true);
    const body = await req.json() as { announcementId?: string; destinationId?: string; requestId?: string; confirmed?: boolean };
    if (body.confirmed !== true || !body.announcementId || !body.destinationId || !body.requestId || !UUID.test(body.requestId))
      return NextResponse.json({ error: 'Annonce, destination et confirmation obligatoires.' }, { status: 400, headers: noStore });

    const { data: row, error: spaceError } = await c.supabase.from('workspaces').select('data').eq('user_id', c.userId).maybeSingle();
    if (spaceError || !row?.data) throw new DeliveryBlocked('Espace utilisateur inaccessible.');
    const ad = row.data.announcements?.find((a: { id: string }) => a.id === body.announcementId);
    const dest = row.data.destinations?.find((d: { id: string }) => d.id === body.destinationId);
    if (!ad || !dest || dest.authorized !== true) throw new DeliveryBlocked('Annonce ou groupe absent, ou publication non autorisée.');
    const work = buildAnnouncementDelivery(ad, dest.handle, 'repost', c.userId);
    const account = await getAccount(c);
    if (!account?.session_ciphertext) throw new DeliveryBlocked('Connectez votre compte Telegram personnel.');
    service = getServiceClient();
    // Download media before claiming the one-and-only Telegram attempt.
    const album = work.kind === 'album' ? await loadAlbum(service, work.photos) : undefined;
    // SQL 015 books one send in the UTC month, atomically and idempotently.
    reservationId = await reserveSend({ userId: c.userId, key: `manual:${body.requestId}`,
      announcementId: body.announcementId, destinationId: body.destinationId, scheduledAt: new Date().toISOString() });
    // PostgreSQL serializes this claim with scheduled worker claims: no race between requests.
    const { data: insertedId, error: claimError } = await service.rpc('nashra_manual_claim', {
      p_user_id: c.userId, p_request_id: body.requestId,
      p_announcement_id: body.announcementId, p_destination_id: body.destinationId,
    });
    if (claimError) {
      // Never release a reused reservation for an already recorded attempt.
      const { data: existingJob } = await service.from('delivery_queue').select('id')
        .eq('user_id', c.userId).eq('job_key', `manual:${body.requestId}`).maybeSingle();
      if (!existingJob && reservationId) await finalizeSend(c.userId, reservationId, 'released');
      if (/unique|duplicate|23505/i.test(claimError.message))
        return NextResponse.json({ error: 'Demande déjà traitée : consultez l’historique avant toute autre action.' }, { status: 409, headers: noStore });
      if (/NASHRA_MANUAL_COOLDOWN/i.test(claimError.message))
        return NextResponse.json({ error: 'Délai de sécurité actif : une tentative par compte toutes les 10 minutes.' }, { status: 429, headers: noStore });
      throw new DeliveryBlocked('Réservation impossible. Exécutez la migration SQL 012 et vérifiez votre file d’attente.');
    }
    if (typeof insertedId !== 'string') {
      await finalizeSend(c.userId, reservationId, 'released');
      throw new DeliveryBlocked('Réservation non confirmée : aucun envoi effectué.');
    }
    jobId = insertedId;
    recorded = true;
    try {
      const telegramId = await sendWithPersonalAccount(account.session_ciphertext, work, album);
      const { error: saveError } = await service.from('delivery_queue').update({ status: 'sent', telegram_message_id: Number(telegramId),
        last_error: null, finished_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', jobId).eq('user_id', c.userId);
      await finalizeSend(c.userId, reservationId, 'confirmed');
      if (saveError) return NextResponse.json({ error: 'Telegram a confirmé le message, mais l’historique n’a pas été mis à jour. Vérifiez avant une nouvelle tentative.', uncertain: true }, { status: 500, headers: noStore });
      return NextResponse.json({ ok: true, telegramMessageId: Number(telegramId), jobId }, { headers: noStore });
    } catch (err) {
      const reason = safeReason(err);
      const state = err instanceof DeliveryBlocked ? 'blocked' : 'needs_review';
      await service.from('delivery_queue').update({ status: state, last_error: reason,
        finished_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', jobId).eq('user_id', c.userId);
      await finalizeSend(c.userId, reservationId, state === 'blocked' ? 'released' : 'uncertain');
      return NextResponse.json({ error: reason, uncertain: state === 'needs_review' }, { status: 409, headers: noStore });
    }
  } catch (err) {
    // When a job was recorded, we must never silently claim it was not sent.
    if (recorded) return NextResponse.json({ error: 'Résultat incertain : vérifiez Telegram et votre historique, sans republier automatiquement.', uncertain: true }, { status: 500, headers: noStore });
    const message = err instanceof Error ? err.message : 'Envoi non disponible. Vérifiez la connexion et les paramètres du serveur.';
    return NextResponse.json({ error: message }, { status: 400, headers: noStore });
  }
}
