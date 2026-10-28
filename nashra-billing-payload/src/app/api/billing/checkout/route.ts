import { NextRequest, NextResponse } from 'next/server';
import { noStore, sameOrigin, session } from '@/lib/nashra-bundle/secure';
import { appUrl, billingMode, configuredPrice, stripeGet, stripePost, type PaidTier } from '@/lib/nashra-bundle/stripe';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Origine non autorisée.' }, { status: 403, headers: noStore });
  const s = await session();
  if (!s) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401, headers: noStore });
  const mode = billingMode();
  if (mode === 'disabled') return NextResponse.json({ error: 'La facturation est désactivée.' }, { status: 503, headers: noStore });
  let requested: PaidTier;
  try {
    const body = await req.json() as { tier?: unknown };
    if (body.tier !== 'pro' && body.tier !== 'business') throw new Error('tier');
    requested = body.tier;
  } catch { return NextResponse.json({ error: 'Choisissez une offre Pro ou Business.' }, { status: 400, headers: noStore }); }
  const price = configuredPrice(requested);
  if (!price) return NextResponse.json({ error: `Offre ${requested} non configurée.` }, { status: 503, headers: noStore });
  const { data: existing, error } = await s.db.from('nashra_subscriptions')
    .select('status,stripe_customer_id,stripe_livemode').eq('user_id', s.user.id).maybeSingle();
  if (error) return NextResponse.json({ error: 'Migration SQL 014 requise.' }, { status: 503, headers: noStore });
  if (existing && ['active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete'].includes(existing.status)
      && existing.stripe_livemode === (mode === 'live')) {
    return NextResponse.json({ error: 'Un abonnement existe déjà. Utilisez « Gérer mon abonnement ».' }, { status: 409, headers: noStore });
  }
  try {
    const origin = appUrl();
    if (req.nextUrl.origin !== origin) return NextResponse.json({ error: 'Domaine différent de NASHRA_APP_URL.' }, { status: 403, headers: noStore });
    const remote = await stripeGet(`prices/${price}`);
    const recurring = remote.recurring as {interval?: unknown; interval_count?: unknown} | undefined;
    if (remote.active !== true || typeof remote.unit_amount !== 'number' || remote.unit_amount <= 0 ||
        (recurring?.interval !== 'month' && recurring?.interval !== 'year') ||
        recurring?.interval_count !== 1) {
      return NextResponse.json({ error: 'Ce tarif Stripe n’est pas un abonnement valide.' },
        { status: 503, headers: noStore });
    }
    const fields = new URLSearchParams({ mode: 'subscription',
      'line_items[0][price]': price, 'line_items[0][quantity]': '1',
      client_reference_id: s.user.id,
      'metadata[nashra_user_id]': s.user.id,
      'subscription_data[metadata][nashra_user_id]': s.user.id,
      success_url: `${origin}/abonnement?retour=succes`,
      cancel_url: `${origin}/abonnement?retour=annule`,
    });
    if (existing?.stripe_customer_id && existing.stripe_livemode === (mode === 'live'))
      fields.set('customer', existing.stripe_customer_id);
    else if (s.user.email) fields.set('customer_email', s.user.email);
    const result = await stripePost('checkout/sessions', fields);
    if (typeof result.url !== 'string' || !result.url.startsWith('https://checkout.stripe.com/'))
      throw new Error('Checkout inattendu.');
    return NextResponse.json({ url: result.url }, { headers: noStore });
  } catch {
    return NextResponse.json({ error: 'Ouverture du paiement impossible. Vérifiez les paramètres Stripe.' }, { status: 502, headers: noStore });
  }
}
