/** Read-only evidence that a Telegram-native scheduled TEXT message was published.
 * Scheduled queue IDs change after delivery. Absence from the queue is NOT proof.
 */
import bigInt from 'big-integer';
import type { TelegramClient } from 'teleproto';
import { Api } from '@/lib/telegram-user/core';
import { summarizePublishedTimeOffsets } from './time-evidence';

/** Local-only, metadata-only trace. No message bodies, peers, IDs or credentials. */
function proofTrace(stage: string, fields: Record<string, string | number | boolean> = {}) {
  if (process.env.NODE_ENV === 'development') {
    console.info('[NASHRA_PROOF]', JSON.stringify({stage, ...fields}));
  }
}

const TOLERANCE_SECONDS = 60;
const MAX_AGE_MS = 7 * 86_400_000;

/** Telegram normalizes CRLF on some clients, but never normalize away content. */
const messageText = (value: string) => value.replace(/\r\n/g, '\n').trim();

export type HistoryMessage = {
  id: number; date: number; out?: boolean; fromScheduled?: boolean;
  message?: string; media?: unknown; replyTo?: unknown;
  fromId?: unknown;
};

/** A scheduled message delivered by Telegram can lack the ordinary outgoing
 * flag in a channel. Telegram's from_scheduled flag is direct evidence of its
 * origin; alternatively we may verify that the author is the connected user.
 * Do not trust text+timestamp alone: someone else could post identical text.
 */
function isOwnScheduledMessage(m: HistoryMessage, selfUserId?: string): boolean {
  if (m.out === true || m.fromScheduled === true) return true;
  if (!selfUserId || !m.fromId || typeof m.fromId !== 'object') return false;
  const from = m.fromId as { userId?: { toString(): string } };
  return from.userId !== undefined && from.userId.toString() === selfUserId;
}

/** Pure, conservative comparison exported for regression tests. */
export function choosePublishedText(messages: readonly HistoryMessage[], text: string,
  plannedAt: string, topicId?: number, selfUserId?: string): number | null {
  const planned = Date.parse(plannedAt);
  if (!Number.isFinite(planned) || !messageText(text)) return null;
  // Count every matching message, including those whose author is unknown.
  // Otherwise an outgoing match could hide a second indistinguishable post.
  const candidates = messages.filter(m => {
    const reply = m.replyTo && typeof m.replyTo === 'object'
      ? m.replyTo as { replyToTopId?: number; replyToMsgId?: number } : null;
    return Number.isSafeInteger(m.id) && m.id > 0 &&
      typeof m.message === 'string' && messageText(m.message) === messageText(text) &&
      (topicId === undefined || reply?.replyToTopId === topicId || reply?.replyToMsgId === topicId) &&
      (m.media === undefined || m.media === null ||
        (typeof m.media === 'object' && m.media !== null && 'className' in m.media &&
          ['MessageMediaEmpty', 'MessageMediaWebPage'].includes(String(m.media.className)))) &&
      Number.isFinite(m.date) && Math.abs(m.date * 1000 - planned) <= TOLERANCE_SECONDS * 1000;
  });
  // Multiple possible matches are ambiguous even if one is outgoing.
  return candidates.length === 1 && isOwnScheduledMessage(candidates[0], selfUserId)
    ? candidates[0].id : null;
}

/** No send/write requests. Return a unique outgoing/scheduled message ID only.
 * Both the scheduled queue and the published history must be readable.
 */
export async function findPublishedText(client: TelegramClient, peer: Api.TypeInputPeer,
  text: string, plannedAt: string, topicId?: number): Promise<number | null> {
  const at = Date.parse(plannedAt);
  const age = Date.now() - at;
  if (!Number.isFinite(at) || age < 75_000 || age > MAX_AGE_MS || !messageText(text)) {
    proofTrace('SKIPPED_INVALID_OR_TOO_EARLY', {ageSeconds: Math.round(age / 1000), hasText: Boolean(messageText(text))});
    return null;
  }

  let pending;
  try { pending = await client.invoke(new Api.messages.GetScheduledHistory({peer, hash: bigInt.zero})); }
  catch { proofTrace('GET_SCHEDULED_HISTORY_FAILED'); throw new Error('Lecture Telegram impossible'); }
  if (!('messages' in pending) || ('count' in pending && pending.count > pending.messages.length)) {
    proofTrace('SCHEDULED_HISTORY_UNAVAILABLE_OR_TRUNCATED');
    return null;
  }
  const stillWaiting = pending.messages.some(m => m instanceof Api.Message &&
    messageText(m.message) === messageText(text) && Math.abs(m.date * 1000 - at) <= 60_000 &&
    (topicId === undefined || (m.replyTo instanceof Api.MessageReplyHeader &&
      (m.replyTo.replyToTopId === topicId || m.replyTo.replyToMsgId === topicId))));
  if (stillWaiting) { proofTrace('SCHEDULE_STILL_PRESENT'); return null; }

  let history;
  try { history = await client.invoke(new Api.messages.GetHistory({
    peer, offsetId: 0, offsetDate: Math.floor((at + 75_000) / 1000),
    addOffset: 0, limit: 100, maxId: 0, minId: 0, hash: bigInt.zero,
  })); }
  catch { proofTrace('GET_PUBLISHED_HISTORY_FAILED'); throw new Error('Lecture Telegram impossible'); }
  if (!('messages' in history)) { proofTrace('PUBLISHED_HISTORY_UNAVAILABLE'); return null; }
  const messages = history.messages.filter((m): m is Api.Message => m instanceof Api.Message);
  // When the requested window is truncated, missing other matching messages
  // could give us a false 'unique' hit. Leave it unresolved instead.
  if (history.messages.length >= 100 &&
    Math.min(...messages.map(m => m.date), Number.POSITIVE_INFINITY) > Math.floor((at - 60_000) / 1000)) {
    proofTrace('PUBLISHED_HISTORY_WINDOW_TRUNCATED', {returned: history.messages.length, decoded: messages.length});
    return null;
  }

  const direct = choosePublishedText(messages, text, plannedAt, topicId);
  if (direct !== null) { proofTrace('CONFIRMED_BY_OUT_OR_SCHEDULED'); return direct; }

  // In some supergroups Telegram does not expose out/from_scheduled on a
  // historical record. Match the actual connected user ID as a fallback,
  // never the group/channel name or the text alone.
  try {
    const me = await client.getMe();
    if (me && 'id' in me && me.id != null) {
      const own = choosePublishedText(messages, text, plannedAt, topicId, me.id.toString());
      if (own !== null) { proofTrace('CONFIRMED_BY_SENDER'); return own; }
    }
  } catch { /* No author proof is not delivery proof. */ }
  const matchingText = messages.filter(m => typeof m.message === 'string' && messageText(m.message) === messageText(text));
  const nearTime = messages.filter(m => Number.isFinite(m.date) && Math.abs(m.date * 1000 - at) <= TOLERANCE_SECONDS * 1000);
  const textAndTime = matchingText.filter(m => Number.isFinite(m.date) && Math.abs(m.date * 1000 - at) <= TOLERANCE_SECONDS * 1000);
  const matchingTopic = textAndTime.filter(m => {
    if (topicId === undefined) return true;
    if (!m.replyTo || typeof m.replyTo !== 'object') return false;
    const r = m.replyTo as {replyToTopId?: number;replyToMsgId?: number};
    return r.replyToTopId === topicId || r.replyToMsgId === topicId;
  });
  const matchingMedia = matchingTopic.filter(m => m.media == null ||
    (typeof m.media === 'object' && 'className' in m.media &&
      ['MessageMediaEmpty', 'MessageMediaWebPage'].includes(String(m.media.className))));
  // Diagnose time mismatches without exposing message text, message IDs, peers,
  // absolute timestamps, or weakening the one-minute confirmation rule.
  const timeOffsets = summarizePublishedTimeOffsets(messages.map(m => m.date),
    matchingText.map(m => m.date), plannedAt);
  proofTrace('NO_UNIQUE_PUBLISHED_PROOF', {
    totalReturned: history.messages.length, decodedMessages: messages.length,
    sameText: matchingText.length, nearTime: nearTime.length,
    sameTextAndTime: textAndTime.length, matchingTopic: matchingTopic.length,
    acceptableMedia: matchingMedia.length,
    withOutgoingFlag: matchingMedia.filter(m => m.out === true).length,
    withScheduledFlag: matchingMedia.filter(m => m.fromScheduled === true).length,
    withSenderField: matchingMedia.filter(m => Boolean(m.fromId)).length,
    ...Object.fromEntries(Object.entries(timeOffsets).filter((entry): entry is [string, number | boolean] => entry[1] !== null)),
  });
  return null;
}
