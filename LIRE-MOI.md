# Nashra — Étape 4A : Checkout mensuel/annuel, Stripe TEST uniquement

## Prérequis

- Étape 3 installée sur le projet et migration **016** vérifiée.
- Migration **017** exécutée si vous voulez que Business = 1 compte Telegram (vérification à faire dans Supabase).
- Conserver votre `.env.local` et **ne jamais le partager**.
- Ce patch s'applique sur les empreintes exactes des fichiers fournis précédemment ; s'il refuse une version différente, **n'utilisez pas `-Force` sur les fichiers sources**.

## Installation, terminal PowerShell de VS Code (à la racine)

```powershell
Expand-Archive "$HOME\Downloads\nashra-etape-4a-stripe-test.zip" -DestinationPath . -Force
node .\install-step4a.cjs
node .\verify-step4a.cjs
node --test .\tests\step4a-stripe.test.cjs
npm run typecheck
npm run build
```

**Aucun SQL nouveau pour cette étape.** Le code utilise `nashra_plans` (migration 015) et les quotas (016).

## Stripe : création des 4 tarifs récurrents en mode TEST

Dans Stripe Dashboard en mode **Test**, créez des **Prices récurrents en USD** :

| Tarif | Intervalle | Prix |
|---|---|---|
| Pro | Tous les mois | 8,00 USD |
| Pro | Tous les ans | 80,00 USD |
| Business | Tous les mois | 19,00 USD |
| Business | Tous les ans | 190,00 USD |

Chaque tarif doit être fixe (*per unit*, 1 mois ou 1 an, pas usage-based).

Dans `.env.local` **sur votre machine uniquement**, configurez les variables de noms suivants en remplaçant chaque valeur par son véritable identifiant Stripe **de test**. Ne partagez pas les valeurs :

```dotenv
NASHRA_BILLING_ENABLED=1
NASHRA_BILLING_MODE=test
STRIPE_SECRET_KEY=sk_test_VOTRE_CLE_DE_TEST
STRIPE_TEST_PRO_MONTHLY_PRICE_ID=price_IDENTIFIANT_PRO_MENSUEL
STRIPE_TEST_PRO_YEARLY_PRICE_ID=price_IDENTIFIANT_PRO_ANNUEL
STRIPE_TEST_BUSINESS_MONTHLY_PRICE_ID=price_IDENTIFIANT_BUSINESS_MENSUEL
STRIPE_TEST_BUSINESS_YEARLY_PRICE_ID=price_IDENTIFIANT_BUSINESS_ANNUEL
NASHRA_APP_URL=http://localhost:3000
```

La variable `STRIPE_WEBHOOK_SECRET` reste nécessaire pour les événements d'abonnement ; sa configuration sera durcie à l'étape 4B. N'utilisez pas de clé `sk_live_`. Dans ce correctif, choisir `NASHRA_BILLING_MODE=live` **désactive toute facturation** volontairement.

Si vous avez encore `STRIPE_TEST_PRICE_ID` (Pro) ou `STRIPE_TEST_BUSINESS_PRICE_ID` (Business), ils restent compatibles **uniquement comme tarifs mensuels**, à condition de correspondre aux montants exacts. Aucun prix annuel par défaut.

## Tests manuels (ne jamais utiliser de vraie carte)

1. Démarrez `npm run dev -- --port 3000`, ouvrez `/abonnement` avec un compte connecté.
2. Sélectionnez « mois » puis « an » ; les prix Stripe doivent correspondre à 8/80 et 19/190 USD.
3. Choisissez une formule : un **Checkout Stripe de test** doit s'ouvrir avec l'intervalle sélectionné.
4. Si un des quatre tarifs manque ou ne correspond pas (USD / montant / intervalle), son bouton doit être indisponible.
5. **Ne déduisez pas qu'un abonnement fonctionne entièrement parce que Checkout s'ouvre.** L'intégration webhook idempotente, la réconciliation quotidienne, les tests de renouvellement et d'échec sont la prochaine étape.

## Fichiers modifiés

- `src/lib/nashra-bundle/stripe.ts`
- `src/lib/billing/entitlements.ts`
- `src/app/api/billing/checkout/route.ts`
- `src/app/api/billing/status/route.ts`
- `src/app/(dashboard)/abonnement/page.tsx`

Le correctif laisse inchangés Telegram, les quotas et RLS, les données Supabase et les 11 traductions ; il réutilise les traductions existantes des termes « mois » et « an ».
