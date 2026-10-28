import { NextRequest, NextResponse } from 'next/server';
import { context, config, decrypt, encrypt, getAccount, makeClient, saveAccount, Api, apiError, type PendingLogin } from '@/lib/telegram-user/core';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  try {
    const c = await context(req, true);
    const body = await req.json() as { code?: string; password?: string };
    const row = await getAccount(c);
    if (!row?.pending_ciphertext) throw new Error('Demandez d’abord un code Telegram.');
    const pending = JSON.parse(decrypt(row.pending_ciphertext)) as PendingLogin;
    if (Date.now() > pending.expiresAt) throw new Error('Le code a expiré. Demandez un nouveau code.');
    const client = makeClient(pending.session);
    try {
      await client.connect();
      const { apiId, apiHash } = config();
      if (pending.needsPassword || body.password) {
        const password = String(body.password ?? '');
        if (!password || password.length > 256) throw new Error('Saisissez votre mot de passe Telegram à deux étapes.');
        await client.signInWithPassword({ apiId, apiHash }, { password: async () => password, onError: async () => true });
      } else {
        const code = String(body.code ?? '').trim();
        if (!/^\d{4,8}$/.test(code)) throw new Error('Saisissez le code reçu sur Telegram.');
        try {
          await client.invoke(new Api.auth.SignIn({ phoneNumber: pending.phone, phoneCodeHash: pending.phoneCodeHash, phoneCode: code }));
        } catch (e) {
          if (String(e).includes('SESSION_PASSWORD_NEEDED')) {
            pending.needsPassword = true;
            pending.session = client.session.save() as string;
            await saveAccount(c, { pending_ciphertext: encrypt(JSON.stringify(pending)) });
            return NextResponse.json({ ok: true, needsPassword: true });
          }
          throw e;
        }
      }
      if (!(await client.checkAuthorization())) throw new Error('Autorisation Telegram non finalisée.');
      const me = await client.getMe();
      const name = `${'firstName' in me ? me.firstName || '' : ''} ${'lastName' in me ? me.lastName || '' : ''}`.trim() || 'Compte Telegram';
      const username = 'username' in me ? me.username || '' : '';
      await saveAccount(c, {
        session_ciphertext: encrypt(client.session.save() as string), pending_ciphertext: null,
        account_name: name, account_username: username,
      });
      return NextResponse.json({ ok: true, connected: true, name, username });
    } finally { await client.disconnect(); }
  } catch (e) { return NextResponse.json({ error: apiError(e) }, { status: 400 }); }
}
