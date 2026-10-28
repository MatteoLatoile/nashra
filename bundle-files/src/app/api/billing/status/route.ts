import { NextResponse } from 'next/server';
import { noStore, session } from '@/lib/nashra-bundle/secure';
import { testStripeReady } from '@/lib/nashra-bundle/stripe';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  const s = await session();
  if (!s) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401, headers: noStore });
  const { data, error } = await s.db.from('nashra_subscriptions')
    .select('status,price_id,current_period_end,cancel_at_period_end,updated_at,stripe_customer_id')
    .eq('user_id',s.user.id).maybeSingle();
  if (error) return NextResponse.json({ error: 'Appliquez la migration SQL 006.' }, { status: 503, headers: noStore });
  return NextResponse.json({ enabled: testStripeReady(), plan: data?.status || 'free',
    currentPeriodEnd: data?.current_period_end || null, cancelAtPeriodEnd: data?.cancel_at_period_end || false,
    hasCustomer: Boolean(data?.stripe_customer_id),
    note: 'Les abonnements sont en mode test. Les limites de forfait ne sont pas encore appliquées.' }, { headers: noStore });
}
