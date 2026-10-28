/** Telegram-native scheduled messages. Telegram, not Nashra's cron, performs delivery. */
import { Api, decrypt, makeClient, resolveDialog } from '@/lib/telegram-user/core';
import type { TelegramClient } from 'teleproto';
import { DeliveryBlocked, type NativeWorkItem } from './worker';

function validateSchedule(at: string): number {
  const millis = Date.parse(at);
  if (!Number.isFinite(millis) || millis <= Date.now() + 180_000 || millis > Date.now() + 90 * 86400_000)
    throw new DeliveryBlocked('Choisissez une date entre 3 minutes et 90 jours dans le futur.');
  return Math.floor(millis / 1000);
}
function validIds(input: unknown): number[] {
  const items = Array.isArray(input) ? input : [input];
  const ids = items.map(x => Number((x as { id?: number } | null)?.id));
  if (!ids.length || ids.some(id => !Number.isSafeInteger(id) || id < 1))
    throw new Error('Telegram n’a pas confirmé les identifiants des messages programmés.');
  return ids;
}
async function access(client: TelegramClient, chatId: string) {
  const target = await resolveDialog(client, chatId);
  if (!target.isGroup && !target.isChannel) throw new DeliveryBlocked('Seuls les groupes ou canaux sont acceptés.');
  const entity = target.entity;
  if (entity instanceof Api.Channel && entity.broadcast && !entity.creator && !entity.adminRights?.postMessages)
    throw new DeliveryBlocked('Vous ne pouvez pas publier dans ce canal.');
  if (entity instanceof Api.Channel && entity.bannedRights?.sendMessages)
    throw new DeliveryBlocked('Telegram interdit l’envoi dans ce groupe.');
  return entity;
}

export async function scheduleWithTelegram(sessionEncrypted: string, work: NativeWorkItem, when: string, album?: Buffer[]): Promise<number[]> {
  const schedule = validateSchedule(when);
  const client = makeClient(decrypt(sessionEncrypted));
  try {
    await client.connect();
    if (!(await client.checkAuthorization())) throw new DeliveryBlocked('Session Telegram expirée : reconnectez le compte.');
    const entity = await access(client, work.destinationChatId);
    if (work.kind === 'text') {
      return validIds(await client.sendMessage(entity, { message: work.body, schedule }));
    }
    if (work.kind === 'album') {
      if (!album || album.length !== work.photos.length || !album.length) throw new DeliveryBlocked('Album incomplet.');
      const captions = album.map((_, i) => i === 0 ? work.body : '');
      const sent = await client.sendFile(entity, { file: album.length === 1 ? album[0] : album,
        caption: album.length === 1 ? work.body : captions, forceDocument: false, scheduleDate: schedule });
      return validIds(sent);
    }
    const from = await resolveDialog(client, work.sourceChatId);
    const messages = await client.getMessages(from.entity, { ids: [work.sourceMessageId] });
    const source = messages[0];
    if (!source) throw new DeliveryBlocked('Message d’origine introuvable.');
    if (work.method === 'forward') {
      return validIds(await client.forwardMessages(entity, { messages: [source.id], fromPeer: from.entity, schedule }));
    }
    return validIds(await client.sendMessage(entity, { message: source, schedule }));
  } finally { await client.disconnect(); }
}

export async function cancelTelegramSchedule(sessionEncrypted: string, chatId: string, ids: number[]) {
  if (!ids.length || ids.some(id => !Number.isSafeInteger(id) || id < 1))
    throw new DeliveryBlocked('Identifiants de programmation Telegram absents.');
  const client = makeClient(decrypt(sessionEncrypted));
  try {
    await client.connect();
    if (!(await client.checkAuthorization())) throw new DeliveryBlocked('Session Telegram expirée.');
    const target = await access(client, chatId);
    await client.deleteScheduledMessages(target, ids);
  } finally { await client.disconnect(); }
}
