/** Server-only worker. NEVER import in a Client Component. */
import { createClient } from '@supabase/supabase-js';
import { Api, decrypt, makeClient, resolveDialog } from '@/lib/telegram-user/core';
import { readiness, type Workspace } from './readiness';

type QueueRow = {
  id: string; user_id: string; job_key: string; campaign_id: string;
  announcement_id: string; destination_id: string; scheduled_at: string;
  method: string; status: string;
};

type WorkItem =
  | { kind: 'source'; sourceChatId: string; sourceMessageId: number; destinationChatId: string;
      method: 'forward' | 'repost' }
  | { kind: 'text'; destinationChatId: string; body: string; method: 'repost' };
class DeliveryBlocked extends Error {}
function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant côté serveur.');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function verifyJob(workspace: Workspace, job: QueueRow): WorkItem {
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
  const hasSource = typeof ad.sourceChatId === 'string' && /^-?\d{3,30}$/.test(ad.sourceChatId)
    && Number.isSafeInteger(ad.sourceMessageId) && (ad.sourceMessageId ?? 0) > 0;
  // Never interpret an incomplete Telegram reference as permission to fall back to text.
  if ((ad.sourceChatId || ad.sourceMessageId) && !hasSource) {
    throw new DeliveryBlocked('Référence Telegram source incomplète.');
  }
  if (hasSource && ad.sourceChatId === dest.handle) {
    throw new DeliveryBlocked('Destination identique à la source.');
  }
  if (job.method === 'forward') {
    if (!hasSource) throw new DeliveryBlocked('Un transfert nécessite un message Telegram source.');
    return { kind: 'source', sourceChatId: ad.sourceChatId!, sourceMessageId: ad.sourceMessageId!,
      destinationChatId: dest.handle, method: 'forward' };
  }
  const text = typeof ad.body === 'string' ? ad.body.trim() : '';
  const hasImages = Array.isArray(ad.imageUrls) && ad.imageUrls.length > 0;
  if (hasImages) {
    // In a repost with images, use only the original Telegram message when accessible.
    // NEVER pretend that locally uploaded images were sent.
    if (!hasSource) throw new DeliveryBlocked('Photos non publiables sans message Telegram source.');
    return { kind: 'source', sourceChatId: ad.sourceChatId!, sourceMessageId: ad.sourceMessageId!,
      destinationChatId: dest.handle, method: 'repost' };
  }
  if (text) {
    if (text.length > 4096) throw new DeliveryBlocked('Message texte trop long (maximum 4 096 caractères).');
    return { kind: 'text', destinationChatId: dest.handle, body: text, method: 'repost' };
  }
  if (!hasSource) throw new DeliveryBlocked('Annonce vide et aucun message Telegram source.');
  return { kind: 'source', sourceChatId: ad.sourceChatId!, sourceMessageId: ad.sourceMessageId!,
    destinationChatId: dest.handle, method: 'repost' };
}

/** No automatic retries: a failed or uncertain attempt requires human review. */
function safeReason(err: unknown): string {
  if (err instanceof DeliveryBlocked) return err.message;
  const message = err instanceof Error ? err.message : '';
  if (/FLOOD_WAIT|SLOWMODE_WAIT/i.test(message)) return 'Telegram impose une limitation de fréquence. Aucun nouvel essai automatique.';
  if (/CHAT_WRITE_FORBIDDEN|CHAT_ADMIN_REQUIRED|USER_BANNED|BANNED_IN_CHANNEL|banned from/i.test(message))
    return 'Compte ou destination non autorisé à publier. Vérifiez les permissions et les restrictions.';
  if (/CHAT_FORWARDS_RESTRICTED/i.test(message)) return 'Le transfert de ce message est protégé par Telegram.';
  if (/SESSION_PASSWORD_NEEDED|AUTH_KEY_UNREGISTERED|SESSION_REVOKED/i.test(message)) return 'Session Telegram expirée : reconnectez votre compte.';
  return 'Envoi non confirmé : intervention manuelle nécessaire. Ne relancez pas sans vérification.';
}

async function sendWithPersonalAccount(encrypted: string, data: WorkItem) {
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
  if (process.env.NASHRA_AUTOMATION_ENABLED !== '1' || process.env.NASHRA_PUBLISHING_ENABLED !== '1') {
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
  try {
    if (Date.now() - Date.parse(job.scheduled_at) > 24 * 60 * 60 * 1000) {
      throw new DeliveryBlocked('Créneau dépassé de plus de 24 heures.');
    }
    const { data: row, error: spaceError } = await db.from('workspaces').select('data')
      .eq('user_id', job.user_id).maybeSingle();
    if (spaceError || !row?.data) throw new DeliveryBlocked('Espace de travail inaccessible.');
    const work = verifyJob(row.data as Workspace, job);
    const { data: account, error: accountError } = await db.from('telegram_accounts').select('session_ciphertext')
      .eq('user_id', job.user_id).maybeSingle();
    if (accountError || !account?.session_ciphertext) throw new DeliveryBlocked('Compte Telegram non connecté.');
    // The only Telegram send for this cron run. Check flags again before side effects.
    if (process.env.NASHRA_AUTOMATION_ENABLED !== '1' || process.env.NASHRA_PUBLISHING_ENABLED !== '1') {
      throw new DeliveryBlocked('Publication désactivée.');
    }
    const posted = await sendWithPersonalAccount(account.session_ciphertext, work);
    messageId = Number(posted);
    if (!Number.isSafeInteger(messageId) || messageId <= 0) throw new Error('Identifiant du message Telegram non confirmé.');
    state = 'sent';
  } catch (err) {
    state = err instanceof DeliveryBlocked ? 'blocked' : 'needs_review';
    reason = safeReason(err);
  }
  const { error: saveError } = await db.from('delivery_queue').update({ status: state,
    last_error: reason, telegram_message_id: messageId, finished_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', job.id).eq('user_id', job.user_id).eq('status', 'processing');
  if (saveError) throw new Error('Résultat non enregistré ; vérification manuelle requise. Ne réessayez pas automatiquement.');
  return { state, id: job.id };
}
