import { NextRequest, NextResponse } from 'next/server';
import { context, config, encrypt, getAccount, makeClient, saveAccount, apiError, type PendingLogin } from '@/lib/telegram-user/core';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  try {
    const c = await context(req, true);
    const { phone } = await req.json() as { phone?: string };
    const number = String(phone ?? '').trim();
    if (!/^\+[1-9]\d{7,14}$/.test(number)) throw new Error('Saisissez votre numéro au format international, par exemple +33612345678.');
    const row = await getAccount(c);
    if (row?.last_code_at && Date.now() - new Date(row.last_code_at).getTime() < 90_000) {
      throw new Error('Patientez au moins 90 secondes avant de demander un nouveau code.');
    }
    const client = makeClient();
    try {
      await client.connect();
      const { apiId, apiHash } = config();
      let result;

try {
  result = await client.sendCode({ apiId, apiHash }, number);
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  const migration = message.match(
    /PHONE_MIGRATE_(\d+)|associated to DC\s+(\d+)/i
  );

  if (!migration) throw error;

  const dc = Number(migration[1] ?? migration[2]);

  if (dc < 1 || dc > 5) throw error;

  const telegram = client as typeof client & {
    _switchDC: (dc: number) => Promise<void>;
  };

  if (typeof telegram._switchDC !== 'function') {
    throw new Error('Migration DC non prise en charge par cette version de teleproto.');
  }

  await telegram._switchDC(dc);

  result = await client.sendCode({ apiId, apiHash }, number);
}
      const pending: PendingLogin = { phone: number, phoneCodeHash: result.phoneCodeHash, session: client.session.save() as string, expiresAt: Date.now() + 8 * 60_000 };
      await saveAccount(c, { pending_ciphertext: encrypt(JSON.stringify(pending)), last_code_at: new Date().toISOString() });
      return NextResponse.json({ ok: true, via: result.isCodeViaApp ? 'Telegram' : 'SMS' });
    } finally { await client.disconnect(); }
  } catch (e) { return NextResponse.json({ error: apiError(e) }, { status: 400 }); }
}
