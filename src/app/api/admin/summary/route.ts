import { NextResponse } from 'next/server';
import { adminAllowed, adminDb, noStore, session } from '@/lib/nashra-bundle/secure';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  const s = await session();
  if (!s) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401, headers: noStore });
  if (!adminAllowed(s.user.id)) return NextResponse.json({ error: 'Accès réservé à l’administration.' }, { status: 403, headers: noStore });
  try {
    const db = adminDb();
    const statuses = ['held','approved','processing','sent','blocked','needs_review','cancelled'];
    const rows = await Promise.all(statuses.map(async status => {
      const { count, error } = await db.from('delivery_queue').select('id', { count: 'exact', head: true }).eq('status',status);
      if (error) throw error;
      return [status, count ?? 0] as const;
    }));
    const { count: subscriberCount, error: billingError } = await db.from('nashra_subscriptions')
      .select('user_id', { count: 'exact', head: true }).in('status', ['active','trialing']);
    if (billingError) throw billingError;
    const { count: accountCount, error: accountsError } = await db.from('telegram_accounts')
      .select('user_id', { count: 'exact', head: true });
    if (accountsError) throw accountsError;
    const staleBefore = new Date(Date.now() - 15 * 60_000).toISOString();
    const expiredBefore = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
    const { count: stalledCount, error: stalledError } = await db.from('delivery_queue')
      .select('id', { count: 'exact', head: true }).eq('status','processing').lt('attempted_at',staleBefore);
    const { count: expiredCount, error: expiredError } = await db.from('delivery_queue')
      .select('id', { count: 'exact', head: true }).eq('status','approved').lt('scheduled_at',expiredBefore);
    if (stalledError || expiredError) throw new Error('Queue monitoring unavailable');
    // Only aggregates; no user emails, sessions, content, personal Telegram identifiers.
    return NextResponse.json({ queue: Object.fromEntries(rows), subscribers: subscriberCount ?? 0,
      telegramConnections: accountCount ?? 0, stalled: stalledCount ?? 0, expired: expiredCount ?? 0, publishingConfigured: process.env.NASHRA_AUTOMATION_ENABLED === '1' && process.env.NASHRA_PUBLISHING_ENABLED === '1' }, { headers: noStore });
  } catch { return NextResponse.json({ error: 'Statistiques indisponibles. Exécutez SQL 006 et vérifiez le rôle serveur.' }, { status: 503, headers: noStore }); }
}
