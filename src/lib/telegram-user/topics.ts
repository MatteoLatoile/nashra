/** Server-only Telegram forum topic discovery and safe routing. */
import 'server-only';
import type { TelegramClient } from 'teleproto';
import { Api, resolveDialog } from './core';

export type TopicSummary = { id: number; title: string; closed: boolean; hidden: boolean };
export class TopicError extends Error {}
export function validTopicId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= 2147483647;
}

/** A channel must actually have Telegram's forum flag set, not merely be a megagroup. */
export async function topicDestination(client: TelegramClient, chatId: string) {
  const dialog = await resolveDialog(client, chatId);
  const entity = dialog.entity;
  if (!(entity instanceof Api.Channel) || !entity.megagroup || !entity.forum)
    return { dialog, isForum: false as const };
  return { dialog, isForum: true as const };
}

export async function forumTopics(client: TelegramClient, chatId: string, query = '') {
  const target = await topicDestination(client, chatId);
  if (!target.isForum) return { isForum: false, topics: [] as TopicSummary[], hasMore: false };
  const peer = await client.getInputEntity(target.dialog.entity);
  const response = await client.invoke(new Api.messages.GetForumTopics({
    peer, q: query || undefined, offsetDate: 0, offsetId: 0, offsetTopic: 0, limit: 100,
  }));
  if (!(response instanceof Api.messages.ForumTopics))
    throw new TopicError('Liste des sujets Telegram indisponible.');
  const topics = response.topics.filter((item): item is Api.ForumTopic => item instanceof Api.ForumTopic)
    .map(item => ({ id: item.id, title: item.title, closed: !!item.closed, hidden: !!item.hidden }));
  return { isForum: true, topics, hasMore: response.count > topics.length };
}

/** Verify current forum state immediately before a Telegram side effect. */
export async function resolveTopic(client: TelegramClient, chatId: string, topicId?: number) {
  const target = await topicDestination(client, chatId);
  if (!target.isForum) {
    if (topicId !== undefined) throw new TopicError('Ce groupe ou canal ne possède pas de sujets Telegram.');
    return undefined;
  }
  if (!validTopicId(topicId))
    throw new TopicError('Ce groupe possède des sujets : choisissez une rubrique avant de publier.');
  const peer = await client.getInputEntity(target.dialog.entity);
  const result = await client.invoke(new Api.messages.GetForumTopicsByID({ peer, topics: [topicId] }));
  if (!(result instanceof Api.messages.ForumTopics)) throw new TopicError('Impossible de vérifier le sujet Telegram.');
  const match = result.topics.find(x => x instanceof Api.ForumTopic && x.id === topicId);
  if (!(match instanceof Api.ForumTopic)) throw new TopicError('Sujet Telegram supprimé ou inaccessible.');
  if (match.closed || match.hidden) throw new TopicError('Sujet Telegram fermé ou masqué : publication bloquée.');
  return topicId === 1 ? undefined : topicId; // Topic 1 is Telegram General.
}

export function topicReply(topicId?: number) {
  return topicId === undefined ? undefined : new Api.InputReplyToMessage({ replyToMsgId: topicId });
}
