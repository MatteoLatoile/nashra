/** Read-only list of forum topics belonging to the signed-in Telegram account. */
import { NextRequest, NextResponse } from 'next/server';
import { context, withClient, apiError } from '@/lib/telegram-user/core';
import { forumTopics } from '@/lib/telegram-user/topics';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const ctx = await context(req);
    const chat = req.nextUrl.searchParams.get('chat') ?? '';
    const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
    if (!/^-?\d{3,30}$/.test(chat) || q.length > 80)
      return NextResponse.json({ error: 'Groupe ou recherche invalide.' }, { status: 400, headers });
    const result = await withClient(ctx, client => forumTopics(client, chat, q));
    return NextResponse.json(result, { headers });
  } catch (error) { return NextResponse.json({ error: apiError(error) }, { status: 400, headers }); }
}
