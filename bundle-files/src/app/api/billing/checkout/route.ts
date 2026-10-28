import { NextRequest, NextResponse } from 'next/server';
import { noStore, sameOrigin, session } from '@/lib/nashra-bundle/secure';
import { appUrl, stripePost, testStripeReady } from '@/lib/nashra-bundle/stripe';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Origine non autorisée.' }, { status: 403, headers: noStore });
  const s = await session();
  if (!s) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401, headers: noStore });
  if (!testStripeReady()) return NextResponse.json({ error: 'Mode test Stripe non configuré.' }, { status: 503, headers: noStore });
  const price = process.env.STRIPE_TEST_PRICE_ID || '';
  if (!/^price_[\w]+$/.test(price)) return NextResponse.json({ error: 'Identifiant de prix Stripe manquant.' }, { status: 503, headers: noStore });
  const { data: existing, error } = await s.db.from('nashra_subscriptions').select('status,stripe_customer_id').eq('user_id', s.user.id).maybeSingle();
  if (error) return NextResponse.json({ error: 'SQL 006 requis.' }, { status: 503, headers: noStore });
  if (existing && ['active','trialing','past_due','unpaid'].includes(existing.status))
    return NextResponse.json({ error: 'Un abonnement existe déjà. Utilisez le portail de facturation.' }, { status: 409, headers: noStore });
  try {
    const origin = appUrl();
    if (req.nextUrl.origin !== origin) return NextResponse.json({ error: 'Domaine différent de NASHRA_APP_URL.' }, { status: 403, headers: noStore });
    const fields = new URLSearchParams({ mode: 'subscription', 'line_items[0][price]': price,
      'line_items[0][quantity]': '1', client_reference_id: s.user.id,
      'metadata[nashra_user_id]': s.user.id, 'subscription_data[metadata][nashra_user_id]': s.user.id,
      success_url: `${origin}/abonnement?retour=succes`, cancel_url: `${origin}/abonnement?retour=annule` });
    if (existing?.stripe_customer_id) fields.set('customer',existing.stripe_customer_id);
    else if (s.user.email) fields.set('customer_email',s.user.email);
    const result = await stripePost('checkout/sessions', fields);
    if (typeof result.url !== 'string' || !result.url.startsWith('https://checkout.stripe.com/'))
      throw new Error('URL Checkout invalide.');
    return NextResponse.json({ url: result.url }, { headers: noStore });
  } catch { return NextResponse.json({ error: 'Impossible d’ouvrir Stripe Checkout (mode test). Vérifiez la configuration.' }, { status: 502, headers: noStore }); }
}
