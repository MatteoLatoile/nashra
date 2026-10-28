import { NextRequest, NextResponse } from 'next/server';
import { context, withClient, resolveDialog, apiError } from '@/lib/telegram-user/core';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  try {
    if (process.env.NASHRA_PUBLISHING_ENABLED !== '1') {
      return NextResponse.json({ error: 'Envois désactivés pour protéger votre compte. Attendez la fin des restrictions Telegram, puis activez volontairement NASHRA_PUBLISHING_ENABLED=1 dans .env.local et redémarrez Nashra.' }, { status: 403 });
    }
    const c = await context(req, true);
    const body = await req.json() as { sourceChatId?: string; sourceMessageId?: number; destinationChatId?: string; mode?: 'forward' | 'repost'; confirmed?: boolean };
    if (body.confirmed !== true || !['forward', 'repost'].includes(body.mode || '')) throw new Error('Confirmation et mode de publication requis.');
    const { sourceChatId = '', sourceMessageId, destinationChatId = '', mode } = body;
    if (!/^[-\d]{3,30}$/.test(sourceChatId) || !/^[-\d]{3,30}$/.test(destinationChatId) || !Number.isSafeInteger(sourceMessageId) || (sourceMessageId ?? 0) <= 0) throw new Error('Message ou destination invalide.');
    if (sourceChatId === destinationChatId) throw new Error('Choisissez une autre conversation de destination.');
    // Vérification serveur (jamais basée sur le booléen transmis par le navigateur).
    const { data: space, error } = await c.supabase.from('workspaces').select('data').eq('user_id', c.userId).single();
    if (error) throw new Error('Impossible de vérifier les autorisations des destinations.');
    const allowed = (space?.data?.destinations || []).some((d: { authorized?: boolean; handle?: string }) => d.authorized === true && d.handle === destinationChatId);
    if (!allowed) throw new Error('Enregistrez ce groupe comme destination autorisée dans Nashra avant de publier.');
    const result = await withClient(c, async client => {
      const from = await resolveDialog(client, sourceChatId);
      const to = await resolveDialog(client, destinationChatId);
      if (!to.isGroup && !to.isChannel) throw new Error('La destination doit être un groupe ou un canal.');
      const matches = await client.getMessages(from.entity!, { ids: [sourceMessageId!] });
      const message = matches[0];
      if (!message) throw new Error('Message introuvable ou inaccessible.');
      if (mode === 'forward') {
        const forwarded = await client.forwardMessages(to.entity!, { messages: [message.id], fromPeer: from.entity! });
        if (!forwarded.length || !forwarded[0]) throw new Error('Transfert non confirmé par Telegram.');
        return { messageId: forwarded[0].id };
      }
      // GramJS recopie le contenu accessible du message, sans contourner la protection de transfert.
      const posted = await client.sendMessage(to.entity!, { message });
      return { messageId: posted.id };
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) { return NextResponse.json({ error: apiError(e) }, { status: 400 }); }
}
