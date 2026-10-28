import { NextResponse } from 'next/server';
import { noStore, session } from '@/lib/nashra-bundle/secure';
import { QUEUE_LIMITS, type NashraTier } from '@/lib/billing/entitlements';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Never accept a user ID or plan from query parameters. The database owns entitlements. */
export async function GET() {
  const s = await session();
  if (!s) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401, headers: noStore });
  const [entitlement, queue] = await Promise.all([
    s.db.from('nashra_entitlements').select('tier,updated_at').eq('user_id', s.user.id).maybeSingle(),
    s.db.from('delivery_queue').select('id', { count: 'exact', head: true })
      .eq('user_id', s.user.id).in('status', ['held', 'approved', 'processing']),
  ]);
  if (entitlement.error || queue.error) {
    return NextResponse.json({ error: 'Quotas indisponibles : appliquer les migrations SQL 004 à 009 dans l’ordre.' },
      { status: 503, headers: noStore });
  }
  const value = entitlement.data?.tier;
  const tier: NashraTier = value === 'pro' || value === 'business' ? value : 'free';
  const limit = QUEUE_LIMITS[tier];
  const used = Math.max(0, queue.count || 0);
  return NextResponse.json({ tier, used, limit, remaining: Math.max(0, limit - used),
    trial: true, updatedAt: entitlement.data?.updated_at ?? null,
    note: 'Quotas de la file d’attente uniquement. Les paiements Stripe sont encore en mode test.' },
    { headers: noStore });
}
