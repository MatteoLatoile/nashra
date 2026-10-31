/**
 * Nashra V0.4 — protocole MTProto utilisant le compte utilisateur.
 * Toutes les sessions sont chiffrées AVANT stockage dans Supabase.
 * Ne jamais imprimer la session, le code OTP ou le mot de passe Telegram.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { TelegramClient, Api } from 'teleproto';
import { StringSession } from 'teleproto/sessions';
import bigInt from 'big-integer';
import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { adminDb } from '@/lib/nashra-bundle/secure';

export { Api };
export type PendingLogin = { phone: string; phoneCodeHash: string; session: string; expiresAt: number; needsPassword?: boolean };
export type AccountRow = {
  user_id: string;
  session_ciphertext: string | null;
  pending_ciphertext: string | null;
  account_name: string | null;
  account_username: string | null;
  last_code_at: string | null;
};

export function config() {
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH?.trim() || '';
  const key = process.env.NASHRA_SESSION_ENCRYPTION_KEY || '';
  if (!Number.isSafeInteger(apiId) || apiId <= 0 || !apiHash || !/^[a-f\d]{64}$/i.test(key)) {
    throw new Error('Configuration Telegram utilisateur manquante : TELEGRAM_API_ID, TELEGRAM_API_HASH et NASHRA_SESSION_ENCRYPTION_KEY (64 caractères hexadécimaux).');
  }
  return { apiId, apiHash, key: Buffer.from(key, 'hex') };
}
export function encrypt(plaintext: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', config().key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${ciphertext.toString('base64url')}`;
}
export function decrypt(encoded: string) {
  const [version, iv, tag, ciphertext] = encoded.split(':');
  if (version !== 'v1' || !iv || !tag || !ciphertext) throw new Error('Session Telegram invalide.');
  const decipher = createDecipheriv('aes-256-gcm', config().key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
}
export async function context(req: NextRequest, mutating = false) {
  if (mutating) {
    const origin = req.headers.get('origin');
    const expected = `${req.nextUrl.protocol}//${req.headers.get('host')}`;
    if (origin !== expected) throw new Error('Requête refusée : origine inattendue.');
  }
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Connectez-vous à votre compte Nashra pour continuer.');
  return { supabase, userId: user.id };
}
export async function getAccount(c: Awaited<ReturnType<typeof context>>): Promise<AccountRow | null> {
  const { data, error } = await adminDb().from('telegram_accounts').select('*').eq('user_id', c.userId).maybeSingle();
  if (error) throw new Error(`Erreur Supabase : ${error.message}. Avez-vous exécuté 002_telegram_accounts.sql ?`);
  return data as AccountRow | null;
}
export async function saveAccount(c: Awaited<ReturnType<typeof context>>, patch: Partial<AccountRow>) {
  // IMPORTANT: un upsert partiel peut effacer les colonnes non fournies.
  // On met à jour uniquement les champs voulus pour préserver la session existante.
  if (patch.user_id !== undefined && patch.user_id !== c.userId) {
    throw new Error('Identifiant Telegram incohérent.');
  }
  const fields = { ...patch };
  delete fields.user_id;
  const current = await getAccount(c);
  const query = current
    ? adminDb().from('telegram_accounts').update({ ...fields, updated_at: new Date().toISOString() }).eq('user_id', c.userId)
    : adminDb().from('telegram_accounts').insert({ user_id: c.userId, ...fields, updated_at: new Date().toISOString() });
  const { error } = await query;
  if (error) throw new Error(`Sauvegarde du compte Telegram impossible : ${error.message}`);
}
export function makeClient(session = '') {
  const { apiId, apiHash } = config();
  return new TelegramClient(new StringSession(session), apiId, apiHash, { connectionRetries: 2, requestRetries: 1 });
}
export async function withClient<T>(c: Awaited<ReturnType<typeof context>>, fn: (client: TelegramClient) => Promise<T>): Promise<T> {
  const row = await getAccount(c);
  if (!row?.session_ciphertext) throw new Error('Connectez d’abord votre compte personnel Telegram.');
  const client = makeClient(decrypt(row.session_ciphertext));
  try {
    await client.connect();
    if (!(await client.checkAuthorization())) throw new Error('Session Telegram expirée : reconnectez votre compte.');
    return await fn(client);
  } finally { await client.disconnect(); }
}
export function apiError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Opération impossible';
  if (/FLOOD_WAIT_(\d+)/.test(message)) return 'Telegram impose un délai de sécurité. Réessayez plus tard.';
  if (/USER_BANNED_IN_CHANNEL|banned from sending messages|banned from participating/i.test(message)) {
    return 'Telegram limite actuellement la participation de votre compte à des groupes ou canaux. Consultez @SpamBot et attendez la fin de la restriction. Ne multipliez pas les tentatives.';
  }
  if (/CHAT_FORWARDS_RESTRICTED|CHAT_WRITE_FORBIDDEN|SLOWMODE_WAIT/.test(message)) {
    return 'Le groupe ou le message interdit cet envoi, ou impose un délai. Respectez ses règles.';
  }
  if (/PHONE_CODE_INVALID|PHONE_CODE_EXPIRED|PASSWORD_HASH_INVALID/.test(message)) return 'Code ou mot de passe Telegram incorrect ou expiré.';
  return message;
}
/**
 * Le getDialogs() haut niveau de teleproto peut planter lorsqu'un dialogue
 * comporte une entité manquante. Nous utilisons la réponse MTProto brute et
 * vérifions les entités avant de les exposer au navigateur.
 */
export type SafeDialog = {
  id: string;
  title: string;
  group: boolean;
  channel: boolean;
  entity: Api.User | Api.Chat | Api.Channel;
};

function peerId(peer: Api.TypePeer): string | null {
  if (peer instanceof Api.PeerUser) return peer.userId.toString();
  if (peer instanceof Api.PeerChat) return (-BigInt(peer.chatId.toString())).toString();
  if (peer instanceof Api.PeerChannel) {
    return '-100' + peer.channelId.toString();
  }
  return null;
}

export async function listDialogsRaw(client: TelegramClient): Promise<SafeDialog[]> {
  const result = await client.invoke(new Api.messages.GetDialogs({
    offsetDate: 0,
    offsetId: 0,
    offsetPeer: new Api.InputPeerEmpty(),
    limit: 100,
    hash: bigInt.zero,
  }));
  if (result instanceof Api.messages.DialogsNotModified) return [];
  if (!('dialogs' in result) || !('chats' in result) || !('users' in result)) {
    throw new Error('Réponse Telegram inattendue lors du chargement des conversations.');
  }

  const byId = new Map<string, SafeDialog>();
  for (const entity of [...result.users, ...result.chats]) {
    if (entity instanceof Api.User) {
      const id = entity.id.toString();
      const title = entity.self ? 'Messages enregistrés' :
        [entity.firstName, entity.lastName].filter(Boolean).join(' ') || entity.username || 'Discussion';
      byId.set(id, { id, title, group: false, channel: false, entity });
    } else if (entity instanceof Api.Chat) {
      const id = (-BigInt(entity.id.toString())).toString();
      byId.set(id, { id, title: entity.title || 'Groupe', group: true, channel: false, entity });
    } else if (entity instanceof Api.Channel) {
      const id = '-100' + entity.id.toString();
      byId.set(id, {
        id, title: entity.title || 'Canal', group: !!entity.megagroup,
        channel: true, entity,
      });
    }
  }

  const output: SafeDialog[] = [];
  const seen = new Set<string>();
  for (const dialog of result.dialogs) {
    if (!(dialog instanceof Api.Dialog)) continue;
    const id = peerId(dialog.peer);
    if (!id || seen.has(id)) continue;
    const found = byId.get(id);
    if (!found) continue; // groupe supprimé/inaccessible : ne pas faire échouer toute la liste
    seen.add(id);
    output.push(found);
  }
  return output;
}

export async function resolveDialog(client: TelegramClient, id: string) {
  const found = (await listDialogsRaw(client)).find(d => d.id === id);
  if (!found) throw new Error('Discussion introuvable parmi vos 100 conversations récentes ou inaccessible.');
  return { entity: found.entity, isGroup: found.group, isChannel: found.channel };
}
