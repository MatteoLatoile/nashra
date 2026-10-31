import { NextRequest, NextResponse } from 'next/server';
import { context, getAccount, decrypt, makeClient, apiError } from '@/lib/telegram-user/core';
import { adminDb } from '@/lib/nashra-bundle/secure';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  try {
    const c = await context(req, true);
    const row = await getAccount(c);
    if (row?.session_ciphertext) {
      const client = makeClient(decrypt(row.session_ciphertext));
      try { await client.connect(); await client.logOut(); } catch { /* Révocation distante impossible : session locale supprimée quand même. */ }
      finally { await client.disconnect(); }
    }
    const { error } = await adminDb().from('telegram_accounts').delete().eq('user_id', c.userId);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ error: apiError(e) }, { status: 400 }); }
}
