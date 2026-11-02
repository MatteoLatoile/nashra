/** Server-only worker. NEVER import in a Client Component. */
import { createClient } from '@supabase/supabase-js';
import { Api, decrypt, makeClient, resolveDialog } from '@/lib/telegram-user/core';
import { readiness, type Workspace } from './readiness';
import { parseStoredPhotos, imageExtension, MAX_PHOTO_BYTES, PHOTO_BUCKET, PhotoReferenceError, type StoredPhoto } from './photos';
import { reserveSend, finalizeSend } from '@/lib/billing/quotas-server';

type QueueRow = {
  id: string; user_id: string; job_key: string; campaign_id: string;
  announcement_id: string; destination_id: string; scheduled_at: string;
  method: string; status: string;
};

export type NativeWorkItem =
  | { kind: 'source'; sourceChatId: string; sourceMessageId: number; destinationChatId: string;
      method: 'forward' | 'repost' }
  | { kind: 'text'; destinationChatId: string; body: string; method: 'repost' }
  | { kind: 'album'; destinationChatId: string; body: string; photos: StoredPhoto[]; method: 'repost' };
export class DeliveryBlocked extends Error {}
export function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant côté serveur.');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export function buildAnnouncementDelivery(ad: NonNullable<Workspace['announcements']>[number], destinationChatId: string,
  method: 'forward' | 'repost', userId: string): NativeWorkItem {
  if (!/^-?\d{3,30}$/.test(destinationChatId)) throw new DeliveryBlocked('Identifiant de destination Telegram invalide.');
  const hasSource = typeof ad.sourceChatId === 'string' && /^-?\d{3,30}$/.test(ad.sourceChatId)
    && Number.isSafeInteger(ad.sourceMessageId) && (ad.sourceMessageId ?? 0) > 0;
  // Never interpret an incomplete Telegram reference as permission to fall back to text.
  if ((ad.sourceChatId || ad.sourceMessageId) && !hasSource) {
    throw new DeliveryBlocked('Référence Telegram source incomplète.');
  }
  if (hasSource && ad.sourceChatId === destinationChatId) {
    throw new DeliveryBlocked('Destination identique à la source.');
  }
  if (method === 'forward') {
    if (!hasSource) throw new DeliveryBlocked('Un transfert nécessite un message Telegram source.');
    return { kind: 'source', sourceChatId: ad.sourceChatId!, sourceMessageId: ad.sourceMessageId!,
      destinationChatId: destinationChatId, method: 'forward' };
  }
  const text = typeof ad.body === 'string' ? ad.body.trim() : '';
  const hasImages = Array.isArray(ad.imageUrls) && ad.imageUrls.length > 0;
  if (hasImages) {
    if (text.length > 1024) throw new DeliveryBlocked('Légende trop longue (1 024 caractères maximum pour un album).');
    let photos: StoredPhoto[];
    try {
      photos = parseStoredPhotos(ad.imageUrls, process.env.NEXT_PUBLIC_SUPABASE_URL || '', userId);
    } catch (err) {
      if (err instanceof PhotoReferenceError) throw new DeliveryBlocked(err.message);
      throw err;
    }
    return { kind: 'album', destinationChatId: destinationChatId, body: text, photos, method: 'repost' };
  }
  if (text) {
    if (text.length > 4096) throw new DeliveryBlocked('Message texte trop long (maximum 4 096 caractères).');
    return { kind: 'text', destinationChatId: destinationChatId, body: text, method: 'repost' };
  }
  if (!hasSource) throw new DeliveryBlocked('Annonce vide et aucun message Telegram source.');
  return { kind: 'source', sourceChatId: ad.sourceChatId!, sourceMessageId: ad.sourceMessageId!,
    destinationChatId: destinationChatId, method: 'repost' };
}

function verifyJob(workspace: Workspace, job: QueueRow): NativeWorkItem {
  const check = readiness(workspace).campaigns.find(x => x.id === job.campaign_id);
  if (!check?.ready) throw new DeliveryBlocked('Campagne non prête, suspendue ou autorisations modifiées.');
  const campaign = workspace.campaigns?.find(x => x.id === job.campaign_id);
  const ad = workspace.announcements?.find(x => x.id === job.announcement_id);
  const dest = workspace.destinations?.find(x => x.id === job.destination_id);
  if (!campaign || !ad || !dest || dest.authorized !== true) throw new DeliveryBlocked('Annonce ou destination introuvable ou non autorisée.');
  if (!campaign.destinationIds?.includes(job.destination_id)) throw new DeliveryBlocked('Destination retirée de la campagne.');
  const ids = campaign.announcementIds?.length ? campaign.announcementIds : campaign.announcementId ? [campaign.announcementId] : [];
  if (!ids.includes(job.announcement_id)) throw new DeliveryBlocked('Annonce retirée de la campagne.');
  const slots = campaign.scheduledDates?.length ? campaign.scheduledDates : campaign.scheduledAt ? [campaign.scheduledAt] : [];
  const sourceSlot = slots.find(s => Number.isFinite(Date.parse(s)) && new Date(s).toISOString() === job.scheduled_at);
  if (!sourceSlot) {
    throw new DeliveryBlocked('Créneau modifié ou supprimé.');
  }
  if (job.job_key !== `${job.campaign_id}:${sourceSlot}:${job.announcement_id}:${job.destination_id}`) {
    throw new DeliveryBlocked('Identité de la tâche incohérente.');
  }
  if (campaign.method !== job.method || !['forward', 'repost'].includes(job.method)) throw new DeliveryBlocked('Mode modifié.');
  if (!dest.handle || !/^-?\d{3,30}$/.test(dest.handle)) {
    throw new DeliveryBlocked('Identifiant Telegram destination invalide.');
  }
  return buildAnnouncementDelivery(ad, dest.handle, job.method as 'forward' | 'repost', job.user_id);
}

/** No automatic retries: a failed or uncertain attempt requires human review. */
export function safeReason(err: unknown): string {
  if (err instanceof DeliveryBlocked) return err.message;
  const message = err instanceof Error ? err.message : '';
  if (/^(Votre forfait actuel autorise moins|Le nombre d’envois déjà réservés dépasse|Limite mensuelle d’envois atteinte)/.test(message)) return message;
  if (/FLOOD_WAIT|SLOWMODE_WAIT/i.test(message)) return 'Telegram impose une limitation de fréquence. Aucun nouvel essai automatique.';
  if (/CHAT_WRITE_FORBIDDEN|CHAT_ADMIN_REQUIRED|USER_BANNED|BANNED_IN_CHANNEL|banned from/i.test(message))
    return 'Compte ou destination non autorisé à publier. Vérifiez les permissions et les restrictions.';
  if (/CHAT_FORWARDS_RESTRICTED/i.test(message)) return 'Le transfert de ce message est protégé par Telegram.';
  if (/SESSION_PASSWORD_NEEDED|AUTH_KEY_UNREGISTERED|SESSION_REVOKED/i.test(message)) return 'Session Telegram expirée : reconnectez votre compte.';
  return 'Envoi non confirmé : intervention manuelle nécessaire. Ne relancez pas sans vérification.';
}

/** Fetch all images BEFORE any Telegram side effect. No arbitrary HTTP URL requests. */
export async function loadAlbum(db: ReturnType<typeof getServiceClient>, photos: StoredPhoto[]): Promise<Buffer[]> {
  const files: Buffer[] = [];
  for (const [index, photo] of photos.entries()) {
    const { data, error } = await db.storage.from(PHOTO_BUCKET).download(photo.key);
    if (error || !data) throw new DeliveryBlocked('Photo indisponible dans Supabase Storage : vérifiez le fichier et le SQL 003.');
    if (data.size < 1 || data.size > MAX_PHOTO_BYTES) throw new DeliveryBlocked('Photo vide ou dépassant 8 Mo.');
    const bytes = Buffer.from(await data.arrayBuffer());
    if (bytes.length < 1 || bytes.length > MAX_PHOTO_BYTES || imageExtension(bytes) !== photo.extension) {
      throw new DeliveryBlocked('Photo invalide ou type de fichier différent de son extension.');
    }
    // Teleproto accepts a named Buffer for file uploads and media albums.
    Object.assign(bytes, { name: `nashra-photo-${index + 1}.${photo.extension}` });
    files.push(bytes);
  }
  return files;
}

export async function sendWithPersonalAccount(encrypted: string, data: NativeWorkItem, album?: Buffer[]) {
  const client = makeClient(decrypt(encrypted));
  try {
    await client.connect();
    if (!(await client.checkAuthorization())) throw new DeliveryBlocked('Session Telegram non autorisée.');
    const to = await resolveDialog(client, data.destinationChatId);
    if (!to.isGroup && !to.isChannel) throw new DeliveryBlocked('La destination ne correspond pas à un groupe ou canal.');
    const destination = to.entity;
    // A broadcast channel requires explicit posting rights.
    if (destination instanceof Api.Channel && destination.broadcast &&
        !destination.creator && !destination.adminRights?.postMessages) {
      throw new DeliveryBlocked('Vous ne possédez pas les droits de publication dans ce canal.');
    }
    if (destination instanceof Api.Channel && destination.bannedRights?.sendMessages) {
      throw new DeliveryBlocked('Telegram interdit la publication dans cette destination.');
    }
    if (data.kind === 'text') {
      // This is a user-authored Nashra announcement, not a bot message.
      const sent = await client.sendMessage(to.entity!, { message: data.body });
      if (!sent.id) throw new Error('Confirmation Telegram absente.');
      return sent.id;
    }
    if (data.kind === 'album') {
      if (!album || album.length !== data.photos.length) throw new DeliveryBlocked('Album incomplet : aucun envoi effectué.');
      const captions = album.map((_, index) => index === 0 ? data.body : '');
      // ONE Telegram request for the album, no separate text message and no silent photo loss.
      const sent = await client.sendFile(to.entity!, {
        file: album.length === 1 ? album[0] : album,
        caption: album.length === 1 ? data.body : captions,
        forceDocument: false,
      });
      const first = Array.isArray(sent) ? sent[0] : sent;
      if (!first?.id) throw new Error('Confirmation Telegram absente pour l’album.');
      return first.id;
    }
    const from = await resolveDialog(client, data.sourceChatId);
    const messages = await client.getMessages(from.entity!, { ids: [data.sourceMessageId] });
    const message = messages[0];
    if (!message) throw new DeliveryBlocked('Le message Telegram source est introuvable.');
    if (data.method === 'forward') {
      const sent = await client.forwardMessages(to.entity!, { messages: [message.id], fromPeer: from.entity! });
      if (!sent[0]?.id) throw new Error('Confirmation Telegram absente.');
      return sent[0].id;
    }
    const sent = await client.sendMessage(to.entity!, { message });
    if (!sent.id) throw new Error('Confirmation Telegram absente.');
    return sent.id;
  } finally { await client.disconnect(); }
}

export async function runOneDelivery(): Promise<{ state: string; id?: string }> {
  if (process.env.NASHRA_AUTOMATION_ENABLED !== '1' || process.env.NASHRA_PUBLISHING_ENABLED !== '1' || process.env.NASHRA_DISABLE_ALL_SENDS === '1') {
    return { state: 'disabled' };
  }
  const db = getServiceClient();
  const { data: claimed, error: claimError } = await db.rpc('nashra_v24_claim_one');
  if (claimError) throw new Error('Impossible de réclamer la file : migration SQL 005 manquante ou RLS incorrect.');
  const job = (claimed as QueueRow[] | null)?.[0];
  if (!job) return { state: 'idle' };
  let state: 'blocked' | 'needs_review' | 'sent' = 'needs_review';
  let reason: string | null = null;
  let messageId: number | null = null;
  let quotaReservationId: string | null = null;
  let telegramAttempted = false;
  try {
    if (Date.now() - Date.parse(job.scheduled_at) > 24 * 60 * 60 * 1000) {
      throw new DeliveryBlocked('Créneau dépassé de plus de 24 heures.');
    }
    const { data: row, error: spaceError } = await db.from('workspaces').select('data')
      .eq('user_id', job.user_id).maybeSingle();
    if (spaceError || !row?.data) throw new DeliveryBlocked('Espace de travail inaccessible.');
    const work = verifyJob(row.data as Workspace, job);
    // Fetch and validate every photo before a Telegram connection/send.
    // On any failure, do not send a partial album or text-only fallback.
    const album = work.kind === 'album' ? await loadAlbum(db, work.photos) : undefined;
    const { data: account, error: accountError } = await db.from('telegram_accounts').select('session_ciphertext')
      .eq('user_id', job.user_id).maybeSingle();
    if (accountError || !account?.session_ciphertext) throw new DeliveryBlocked('Compte Telegram non connecté.');
    // The only Telegram send for this cron run. Check flags again before side effects.
    if (process.env.NASHRA_AUTOMATION_ENABLED !== '1' || process.env.NASHRA_PUBLISHING_ENABLED !== '1' || process.env.NASHRA_DISABLE_ALL_SENDS === '1') {
      throw new DeliveryBlocked('Publication désactivée.');
    }
    // Legacy queue jobs can be prepared by clients. A DB-backed reservation is
    // mandatory immediately before Telegram, so they cannot bypass the monthly cap.
    quotaReservationId = await reserveSend({ userId: job.user_id, key: `job:${job.job_key}`,
      announcementId: job.announcement_id, destinationId: job.destination_id,
      scheduledAt: job.scheduled_at });
    telegramAttempted = true;
    const posted = await sendWithPersonalAccount(account.session_ciphertext, work, album);
    messageId = Number(posted);
    if (!Number.isSafeInteger(messageId) || messageId <= 0) throw new Error('Identifiant du message Telegram non confirmé.');
    state = 'sent';
  } catch (err) {
    state = !telegramAttempted || err instanceof DeliveryBlocked ? 'blocked' : 'needs_review';
    reason = safeReason(err);
  }
  if (quotaReservationId) {
    await finalizeSend(job.user_id, quotaReservationId, state === 'sent' ? 'confirmed' :
      state === 'blocked' ? 'released' : 'uncertain');
  }
  const { error: saveError } = await db.from('delivery_queue').update({ status: state,
    last_error: reason, telegram_message_id: messageId, finished_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', job.id).eq('user_id', job.user_id).eq('status', 'processing');
  if (saveError) throw new Error('Résultat non enregistré ; vérification manuelle requise. Ne réessayez pas automatiquement.');
  return { state, id: job.id };
}
