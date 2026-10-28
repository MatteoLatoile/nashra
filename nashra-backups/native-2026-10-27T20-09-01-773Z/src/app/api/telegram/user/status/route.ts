import { NextRequest, NextResponse } from 'next/server';
import { context, config, getAccount, apiError } from '@/lib/telegram-user/core';
export const runtime = 'nodejs';
export async function GET(req: NextRequest) {
  try {
    config();
    const c = await context(req);
    const row = await getAccount(c);
    return NextResponse.json({ configured: true, publishingEnabled: process.env.NASHRA_PUBLISHING_ENABLED === '1', connected: !!row?.session_ciphertext, name: row?.account_name, username: row?.account_username });
  } catch (e) { return NextResponse.json({ configured: false, connected: false, error: apiError(e) }, { status: 400 }); }
}
