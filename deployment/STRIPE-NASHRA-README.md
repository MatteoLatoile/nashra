# Nashra — intégration Stripe (production)

Ce patch exploite les routes EXISTANTES `/api/billing/checkout`, `/api/billing/portal`,
`/api/billing/status` et `/api/billing/webhook`, sans modifier Telegram ni les quotas.
**Il ne modifie pas ton compte Stripe, Vercel ou Supabase à distance et n'active pas lui-même les paiements.**

## 1. Avant tout : sauvegarde et base Supabase

Fais un backup Supabase, puis dans **SQL Editor**, vérifie que les migrations
`006`, `009`, `014`, `015` et `016` sont déjà appliquées. Si elles le sont,
applique uniquement `supabase/019_stripe_production_sync.sql` (une fois).
`019` ajoute une fonction transactionnelle : déduplication des événements Stripe,
mise à jour des abonnements ET des droits en une seule transaction.
Elle utilise la table `nashra_billing_events` déjà créée par la migration 015.

**Ordre critique : appliquer la migration 019 AVANT de déployer le nouveau webhook.**

## 2. Vercel > Project > Settings > Environment Variables

Configure ces valeurs pour **Production** (ne jamais les exposer au navigateur) :

```dotenv
NASHRA_BILLING_ENABLED=1
NASHRA_BILLING_MODE=live
NASHRA_BILLING_LIVE_CONFIRM=I_ACCEPT_REAL_CHARGES
NASHRA_APP_URL=https://www.usenashra.com
STRIPE_SECRET_KEY=sk_live_TON_SECRET_A_RENSEIGNER_SUR_VERCEL
STRIPE_WEBHOOK_SECRET=whsec_TON_SECRET_A_RENSEIGNER_SUR_VERCEL
STRIPE_LIVE_PRO_MONTHLY_PRICE_ID=price_1UVqEOHltcyvjFVc9qBEuczF
STRIPE_LIVE_PRO_YEARLY_PRICE_ID=price_1UVqEOHltcyvjFVcNA0CdKHD
STRIPE_LIVE_BUSINESS_MONTHLY_PRICE_ID=price_1UVqIcHltcyvjFVc2VH0HJKe
STRIPE_LIVE_BUSINESS_YEARLY_PRICE_ID=price_1UVqIcHltcyvjFVccAW3vp2Y
```

Conserve aussi `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
(selon la config actuelle) et la clé serveur `SUPABASE_SERVICE_ROLE_KEY`.
Ne partage PAS de clés `sk_live_`, `whsec_` ou de clé service_role.

**L'URL doit correspondre exactement au domaine ouvert**, sans redirection
`www` ⇄ sans `www` pendant l'appel API. La simple présence de « Mode production »
dans Stripe ne confirme pas l'éligibilité juridique de l'entreprise déclarée.
N'active ces valeurs qu'après vérification de la société/pays de résidence juridique,
des CGV/conditions de vente, de la politique de confidentialité et du fonctionnement du site.

## 3. Stripe > Workbench > Webhooks (ou « Event destinations »)

Créer une destination **Live / Production** :

```
https://www.usenashra.com/api/billing/webhook
```

Écouter les événements :

```
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
customer.subscription.paused
customer.subscription.resumed
customer.subscription.pending_update_applied
checkout.session.completed
checkout.session.async_payment_succeeded
invoice.paid
invoice.payment_failed
```

Copier le **Signing secret** de CETTE destination (whsec_...) dans la variable
Vercel `STRIPE_WEBHOOK_SECRET` ; **pas la clé API**. Enregistrer et redéployer.
Stripe doit recevoir un HTTP 200 pour les événements reconnus.
Des événements peuvent être livrés plusieurs fois et dans le désordre ;
leur traitement est idempotent et relit l'état actuel chez Stripe.

## 4. Portail client Stripe

Le portail est déjà configuré. Pour l'instant, conserver la modification de forfait
via portail désactivée tant que les changements de prix/proratas ne sont pas vérifiés.
Les clients peuvent voir leurs factures, modifier leur moyen de paiement et résilier
à la fin de la période payée. Vérifier l'URL de retour `https://www.usenashra.com`.

## 5. Vérifications indispensables avant vente réelle

- Après déploiement et configuration, ouvre `/abonnement` connecté : les quatre tarifs
  doivent apparaître (8/80 et 19/190 USD) et l'indicateur « Paiements réels activés ».
- Vérifie la réponse de `/api/billing/status` : `enabled: true`, `billingMode: "live"`
  et `available: true` pour les 4 prix. Une erreur indique clé ou tarif invalide.
- Vérifie que la migration 019 est bien en base. Sans elle, le webhook retourne 500.
- Contrôle Stripe Workbench pour les livraisons de webhook, erreurs et retries.
- Effectue un achat contrôlé uniquement si tu acceptes une **vraie facturation**;
  vérifie la réception des événements, le passage de `free` à `pro/business`
  dans `/abonnement`, les quotas et la résiliation depuis le portail.
- Le retour `?retour=succes` NE suffit pas à accorder un forfait.
- **Point fonctionnel à vérifier avant de vendre Business** : dans l'archive d'origine,
  les routes `telegram_accounts` semblent basées sur un unique compte par utilisateur
  (`maybeSingle()`), alors que Business annonce 3 comptes Telegram. Ce patch n'ajoute
  pas la gestion multi-comptes ; ne promets pas cette fonctionnalité avant son implémentation.

### Dépannage

- Offres indisponibles : vérifier **live** vs **test**, IDs `price_` et montants SQL 015.
- Message « facturation désactivée » : vérifier les 4 flags live, la clé `sk_live_`
  et le secret webhook `whsec_` sur le bon environnement Vercel, puis redéployer.
- Webhook 500 : vérifier migration 019, `SUPABASE_SERVICE_ROLE_KEY` et logs Vercel.
- Webhook 400 : vérifier le secret de signature du bon endpoint et les événements live.
- Pas d'accès Pro malgré le paiement : voir `nashra_billing_events`,
  `nashra_subscriptions`, l'échéance et les webhooks reçus; jamais attribuer un tier
  en base manuellement sans comprendre la cause.

## 6. Remplacer les fichiers dans le projet d'origine

L'archive complète fournie contient la version modifiée. Tu peux aussi utiliser
le **patch léger** qui contient seulement les fichiers changés. Après une sauvegarde :

```powershell
# PowerShell, à lancer à la racine de ton projet Nashra :
Expand-Archive "$HOME\Downloads\Nashra-Stripe-PATCH.zip" -DestinationPath . -Force
npm install
npm run typecheck
npm run build
```

ATTENTION : `Expand-Archive -Force` remplace les fichiers modifiés. Si tu as fait
évoluer ton projet depuis le ZIP initial, fais une sauvegarde/compare les différences
avant de remplacer les fichiers. Les variables d'environnement ne sont pas incluses.
