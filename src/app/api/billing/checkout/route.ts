import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';

import {
  adminDb,
  noStore,
  sameOrigin,
  session,
} from '@/lib/nashra-bundle/secure';

import {
  appUrl,
  billingMode,
  configuredPrice,
  stripeGet,
  stripePost,
  validStripePrice,
  type BillingInterval,
  type PaidTier,
} from '@/lib/nashra-bundle/stripe';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  // 1. Protection contre les requêtes provenant d'autres sites.
  if (!sameOrigin(req)) {
    return NextResponse.json(
      { error: 'Origine non autorisée.' },
      { status: 403, headers: noStore }
    );
  }

  // 2. Vérifier que l'utilisateur est connecté.
  const s = await session();

  if (!s) {
    return NextResponse.json(
      { error: 'Connexion requise.' },
      { status: 401, headers: noStore }
    );
  }

  // 3. Vérifier le mode de facturation.
  const mode = billingMode();

  if (mode === 'disabled') {
    return NextResponse.json(
      { error: 'La facturation est désactivée.' },
      { status: 503, headers: noStore }
    );
  }

  // 4. Lire le forfait demandé.
  let requested: PaidTier;
  let interval: BillingInterval;

  try {
    const body = (await req.json()) as {
      tier?: unknown;
      interval?: unknown;
    };

    if (body.tier !== 'pro' && body.tier !== 'business') {
      throw new Error('tier');
    }

    if (body.interval !== 'month' && body.interval !== 'year') {
      throw new Error('interval');
    }

    requested = body.tier;
    interval = body.interval;
  } catch {
    return NextResponse.json(
      {
        error:
          'Choisissez une offre Pro/Business et une période mensuelle/annuelle.',
      },
      { status: 400, headers: noStore }
    );
  }

  // 5. Récupérer le tarif Stripe configuré.
  const price = configuredPrice(requested, interval);

  if (!price) {
    return NextResponse.json(
      {
        error: `Prix Stripe manquant pour ${requested}/${interval}.`,
      },
      { status: 503, headers: noStore }
    );
  }

  // 6. Vérifier le tarif dans le catalogue Supabase.
  const { data: plan, error: planError } = await s.db
    .from('nashra_plans')
    .select('monthly_price_usd_cents,annual_price_usd_cents')
    .eq('slug', requested)
    .eq('is_active', true)
    .maybeSingle();

  if (planError || !plan) {
    return NextResponse.json(
      {
        error: 'Catalogue des forfaits indisponible (SQL 015).',
      },
      { status: 503, headers: noStore }
    );
  }

  const expected =
    interval === 'year'
      ? plan.annual_price_usd_cents
      : plan.monthly_price_usd_cents;

  // 7. Vérifier si un abonnement existe déjà.
  const { data: existing, error } = await s.db
    .from('nashra_subscriptions')
    .select('status,stripe_customer_id,stripe_livemode')
    .eq('user_id', s.user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      {
        error: 'Migration SQL 014 requise.',
      },
      { status: 503, headers: noStore }
    );
  }

  if (
    existing &&
    [
      'active',
      'trialing',
      'past_due',
      'unpaid',
      'paused',
      'incomplete',
    ].includes(existing.status) &&
    existing.stripe_livemode === (mode === 'live')
  ) {
    return NextResponse.json(
      {
        error:
          'Un abonnement existe déjà. Utilisez « Gérer mon abonnement ».',
      },
      { status: 409, headers: noStore }
    );
  }

  try {
    // 8. Vérifier que les fonctions SQL de facturation sont installées.
    const { data: ready, error: readinessError } = await adminDb().rpc(
      'nashra_billing_ready_v2'
    );

    if (readinessError || ready !== true) {
      return NextResponse.json(
        {
          error:
            'Base de facturation non prête : appliquez SQL 019 avant les paiements.',
        },
        { status: 503, headers: noStore }
      );
    }

    // 9. Vérifier le domaine public de Nashra.
    //
    // Sur Vercel, req.nextUrl.origin peut différer du domaine
    // public réellement utilisé par le navigateur.
    //
    // On compare donc l'en-tête Origin à NASHRA_APP_URL,
    // tout en conservant la vérification sameOrigin(req).

    const origin = appUrl();
    const requestOrigin = req.headers.get('origin');

    if (requestOrigin !== origin) {
      return NextResponse.json(
        {
          error: 'Domaine différent de NASHRA_APP_URL.',
        },
        { status: 403, headers: noStore }
      );
    }

    // 10. Vérifier que le tarif Stripe correspond au catalogue.
    const remote = await stripeGet(`prices/${price}`);

    if (
      remote.id !== price ||
      !validStripePrice(remote, interval, expected)
    ) {
      return NextResponse.json(
        {
          error:
            'Le prix Stripe ne correspond pas au montant USD et à la période configurés en base.',
        },
        { status: 503, headers: noStore }
      );
    }

    // 11. Préparer la session Stripe Checkout.
    const fields = new URLSearchParams({
      mode: 'subscription',

      'line_items[0][price]': price,
      'line_items[0][quantity]': '1',

      client_reference_id: s.user.id,

      'metadata[nashra_user_id]': s.user.id,
      'metadata[nashra_plan]': requested,
      'metadata[nashra_interval]': interval,

      'subscription_data[metadata][nashra_user_id]':
        s.user.id,

      success_url: `${origin}/abonnement?retour=succes&session_id={CHECKOUT_SESSION_ID}`,

      cancel_url: `${origin}/abonnement?retour=annule`,
    });

    // 12. Réutiliser le client Stripe existant si nécessaire.
    if (
      existing?.stripe_customer_id &&
      existing.stripe_livemode === (mode === 'live')
    ) {
      fields.set('customer', existing.stripe_customer_id);
    } else if (s.user.email) {
      fields.set('customer_email', s.user.email);
    }

    // 13. Empêcher les créations répétées de sessions Checkout.
    //
    // Les tentatives identiques effectuées dans une fenêtre
    // de 10 minutes réutilisent la même clé d'idempotence.

    const bucket = Math.floor(Date.now() / 600_000);

    const idempotencyKey =
      'nashra-checkout-' +
      createHash('sha256')
        .update(`${mode}:${s.user.id}:${price}:${bucket}`)
        .digest('hex')
        .slice(0, 48);

    // 14. Créer la session Stripe Checkout.
    const result = await stripePost(
      'checkout/sessions',
      fields,
      idempotencyKey
    );

    // 15. Vérifier l'URL renvoyée par Stripe.
    if (
      typeof result.url !== 'string' ||
      !result.url.startsWith('https://checkout.stripe.com/')
    ) {
      throw new Error('Checkout inattendu.');
    }

    // 16. Renvoyer l'URL Stripe au navigateur.
    return NextResponse.json(
      {
        url: result.url,
      },
      {
        headers: noStore,
      }
    );
  } catch {
    return NextResponse.json(
      {
        error:
          'Ouverture du paiement impossible. Vérifiez les paramètres Stripe.',
      },
      {
        status: 502,
        headers: noStore,
      }
    );
  }
}