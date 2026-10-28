import { NextRequest, NextResponse } from 'next/server';
import { noStore, sameOrigin, session } from '@/lib/nashra-bundle/secure';
import { appUrl, stripePost, testStripeReady } from '@/lib/nashra-bundle/stripe';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Origine non autorisée.' }, { status: 403, headers: noStore });
  const s = await session();
  if (!s) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401, headers: noStore });
  if (!testStripeReady()) return NextResponse.json({ error: 'Stripe non configuré.' }, { status: 503, headers: noStore });
  const { data, error } = await s.db.from('nashra_subscriptions').select('stripe_customer_id').eq('user_id',s.user.id).maybeSingle();
  if (error || !data?.stripe_customer_id) return NextResponse.json({ error: 'Compte de facturation introuvable.' }, { status: 404, headers: noStore });
  try {
    const origin = appUrl();
    if (req.nextUrl.origin !== origin) return NextResponse.json({ error: 'Domaine non reconnu.' }, { status: 403, headers: noStore });
    const result = await stripePost('billing_portal/sessions',new URLSearchParams({ customer: data.stripe_customer_id,
      return_url: `${origin}/abonnement` }));
    if (typeof result.url !== 'string' || !result.url.startsWith('https://billing.stripe.com/'))
      throw new Error('URL portail invalide.');
    return NextResponse.json({ url: result.url }, { headers: noStore });
  } catch { return NextResponse.json({ error: 'Portail Stripe indisponible (mode test).' }, { status: 502, headers: noStore }); }
}
