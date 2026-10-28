import { NextRequest, NextResponse } from 'next/server';
import { context, withClient, resolveDialog, apiError } from '@/lib/telegram-user/core';
export const runtime = 'nodejs';
export async function GET(req: NextRequest) {
  try {
    const c = await context(req);
    const chatId = req.nextUrl.searchParams.get('chat') || '';
    const selectedId = req.nextUrl.searchParams.get('id');
    const messageId = selectedId ? Number(selectedId) : null;
    if (selectedId && (!Number.isSafeInteger(messageId) || (messageId ?? 0) < 1)) throw new Error('Référence du message invalide.');
    if (!/^[-\d]{3,30}$/.test(chatId)) throw new Error('Choisissez une conversation.');
    const messages = await withClient(c, async client => {
      const dialog = await resolveDialog(client, chatId);
      const msgs = messageId ? await client.getMessages(dialog.entity!, { ids: [messageId] }) : await client.getMessages(dialog.entity!, { limit: 40 });
      return msgs.filter(m => m.id && (m.message || m.media)).map(m => ({
        id: m.id, text: m.message || '', media: !!m.media, date: m.date,
        groupedId: m.groupedId?.toString() || null,
      }));
    });
    return NextResponse.json({ messages });
  } catch (e) { return NextResponse.json({ error: apiError(e) }, { status: 400 }); }
}
