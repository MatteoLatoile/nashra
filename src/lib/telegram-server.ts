/** Nashra V0.2 — démonstration LOCALE Telegram Bot API.
 * Aucune de ces routes ne doit être exposée sur un SaaS public avant authentification,
 * autorisation par utilisateur, chiffrement des secrets et quotas serveur.
 */
import type { NextRequest } from 'next/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient as createSupabaseClient } from '@/lib/supabase/server';

export type TgChat = { id: number; type: string; title?: string; username?: string; permissions?: { can_send_messages?: boolean } };
export type TgUser = { id: number; username?: string; first_name?: string; is_bot: boolean };
export type TgMessage = {
  message_id: number;
  chat: TgChat;
  from?: TgUser;
  text?: string;
  caption?: string;
  date?: number;
  photo?: unknown[];
  video?: unknown;
  document?: unknown;
  animation?: unknown;
  audio?: unknown;
  voice?: unknown;
  media_group_id?: string;
};
export type TgUpdate = { update_id: number; message?: TgMessage };
type TgReply<T> = { ok: boolean; result?: T; description?: string; error_code?: number; parameters?: { retry_after?: number } };

export async function localOnly(req: NextRequest) {
  const host = req.headers.get('host') ?? '';
  const origin = req.headers.get('origin');
  const localHost = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  if (process.env.NODE_ENV !== 'development' || process.env.NASHRA_LOCAL_DEV !== '1' || !localHost) {
    throw new Error('Fonction disponible seulement en développement local avec NASHRA_LOCAL_DEV=1.');
  }
  if (origin && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    throw new Error('Origine non autorisée.');
  }
  // Un jeton de bot global ne doit jamais être exposé à plusieurs comptes Nashra.
  // Autoriser un SEUL compte développeur pendant les essais locaux.
  if (isSupabaseConfigured()) {
    const allowedUserId = process.env.NASHRA_DEV_USER_ID;
    if (!allowedUserId) throw new Error('Définissez NASHRA_DEV_USER_ID (UUID de votre propre compte Supabase) pour tester Telegram localement.');
    const supabase = await createSupabaseClient();
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data?.claims?.sub || data.claims.sub !== allowedUserId) {
      throw new Error('Accès Telegram réservé au compte développeur autorisé.');
    }
  }
}

export function friendlyError(error: unknown) {
  return error instanceof Error ? error.message : 'Une erreur inattendue est survenue.';
}

export async function telegram<T>(method: string, parameters: Record<string, unknown> = {}): Promise<T> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN manquant : configure le fichier .env.local puis redémarre le serveur.');
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(token)) throw new Error('Format du jeton du bot invalide.');
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(parameters),
    cache: 'no-store',
    signal: AbortSignal.timeout(12000),
  });
  const payload = await res.json() as TgReply<T>;
  if (!res.ok || !payload.ok || payload.result === undefined) {
    const errorInfo = payload.description ?? 'Telegram ne répond pas.';
    const wait = payload.parameters?.retry_after ? ` Attends ${payload.parameters.retry_after} secondes.` : '';
    throw new Error(`${errorInfo}${wait}`);
  }
  return payload.result;
}

export function normalizeDestination(value: unknown) {
  if (typeof value !== 'string') throw new Error('Identifiant de destination absent.');
  let id = value.trim();
  const link = id.match(/^https?:\/\/(?:www\.)?t\.me\/([A-Za-z][A-Za-z0-9_]{4,31})\/?$/i);
  if (link) id = `@${link[1]}`;
  if (!/^@[A-Za-z][A-Za-z0-9_]{4,31}$/.test(id) && !/^-\d{6,20}$/.test(id)) {
    throw new Error('Renseigne un @groupe_public ou un identifiant numérique du type -1001234567890. Les liens d’invitation ne suffisent pas.');
  }
  return id;
}

export async function verifiedDestination(handle: unknown): Promise<TgChat> {
  const target = normalizeDestination(handle);
  const chat = await telegram<TgChat>('getChat', { chat_id: target });
  if (!['group', 'supergroup', 'channel'].includes(chat.type)) {
    throw new Error('Destination refusée : il faut un groupe ou un canal Telegram, pas une conversation privée.');
  }
  const bot = await telegram<TgUser>('getMe');
  const member = await telegram<{ status: string; can_post_messages?: boolean; can_send_messages?: boolean }>('getChatMember', { chat_id: chat.id, user_id: bot.id });
  if (member.status === 'left' || member.status === 'kicked') throw new Error('Ajoute le bot au groupe / canal avant la publication.');
  if (chat.type === 'channel' && member.status !== 'creator' && !(member.status === 'administrator' && member.can_post_messages)) {
    throw new Error('Le bot doit être administrateur avec le droit de publier dans ce canal.');
  }
  if (member.status === 'restricted' && !member.can_send_messages) throw new Error('Le bot ne peut pas envoyer de messages dans ce groupe.');
  if (chat.type !== 'channel' && member.status === 'member' && chat.permissions?.can_send_messages === false) {
    throw new Error('Le groupe empêche le bot de publier. Vérifie les permissions des administrateurs.');
  }
  return chat;
}

export function sourceFromTelegramLink(url: unknown): { chatId: string; messageId: number } | null {
  if (typeof url !== 'string' || !url.trim()) return null;
  const publicLink = url.trim().match(/^https?:\/\/(?:www\.)?t\.me\/([A-Za-z][A-Za-z0-9_]{4,31})\/(\d+)(?:\?.*)?$/i);
  if (publicLink) return { chatId: `@${publicLink[1]}`, messageId: Number(publicLink[2]) };
  const privateLink = url.trim().match(/^https?:\/\/(?:www\.)?t\.me\/c\/(\d+)\/(\d+)(?:\?.*)?$/i);
  if (privateLink) return { chatId: `-100${privateLink[1]}`, messageId: Number(privateLink[2]) };
  return null;
}
