import { NextRequest, NextResponse } from 'next/server';
import { context, withClient, listDialogsRaw, apiError } from '@/lib/telegram-user/core';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const c = await context(req);
    const dialogs = await withClient(c, client => listDialogsRaw(client));
    return NextResponse.json({ dialogs: dialogs.map(({ id, title, group, channel }) => ({
      id, title, group, channel,
    })) });
  } catch (e) {
    return NextResponse.json({ error: apiError(e) }, { status: 400 });
  }
}
