import { NextRequest, NextResponse } from 'next/server';
import { context, config, decrypt, getAccount, apiError, type PendingLogin } from '@/lib/telegram-user/core';
export const runtime = 'nodejs';
export async function GET(req: NextRequest) {
  try {
    config();
    const c = await context(req);
    const row = await getAccount(c);
    const retryAfterSeconds = row?.last_code_at
      ? Math.max(0, Math.ceil((90_000 - (Date.now() - new Date(row.last_code_at).getTime())) / 1000)) : 0;
    let pending: { phone: string; via: 'Telegram' | 'Autre'; expiresAt: number; needsPassword: boolean } | null = null;
    if (!row?.session_ciphertext && row?.pending_ciphertext) {
      try {
        const restored = JSON.parse(decrypt(row.pending_ciphertext)) as PendingLogin;
        if (restored.expiresAt > Date.now() && /^\+[1-9]\d{7,14}$/.test(restored.phone)) {
          pending = { phone: restored.phone, via: restored.codeDelivery === 'Telegram' ? 'Telegram' : 'Autre', expiresAt: restored.expiresAt, needsPassword: !!restored.needsPassword };
        }
      } catch { /* Do not expose encrypted session errors to the browser. */ }
    }
    return NextResponse.json({ configured: true, publishingEnabled: process.env.NASHRA_DISABLE_ALL_SENDS !== '1', connected: !!row?.session_ciphertext, name: row?.account_name, username: row?.account_username, pending, retryAfterSeconds });
  } catch (e) { return NextResponse.json({ configured: false, connected: false, error: apiError(e) }, { status: 400 }); }
}
