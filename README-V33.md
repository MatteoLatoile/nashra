# Nashra V3.3 — Quotas des forfaits (Stripe TEST uniquement)

Cette mise à jour met en place une **vraie limite côté PostgreSQL** sur le nombre d'opérations en attente. L'interface seule n'est pas une protection ; la migration SQL 009 impose les plafonds sur les insertions directes Supabase comme sur l'API.

## Fonctions
- Gratuit : **100** opérations actives (`held`, `approved`, `processing`) simultanées.
- Pro : **300** ; Business : **500**, sous réserve d'un abonnement Stripe **de test** dont le prix correspond **exactement** à une variable secrète côté serveur.
- Les opérations terminées, annulées, bloquées, ou à vérifier ne sont pas comptées. Aucune opération existante n'est supprimée lors d'une rétrogradation : seules les nouvelles insertions au-dessus du plafond sont refusées.
- `/limites` : nouveau tableau de bord des quotas. La navigation affiche « Limites ».
- `/api/billing/limits` : lecture authentifiée du quota et de l'utilisation du compte actif ; aucun ID utilisateur n'est accepté côté client.
- Stripe : les droits ne sont modifiés qu'à réception d'un **webhook de test avec signature valide**, pour des statuts `active` ou `trialing`, et uniquement pour un prix préconfiguré. Un Checkout non confirmé ne confère aucun droit.
- 11 langues : nouvelles chaînes traduites et interface RTL compatible.
- **Aucun message Telegram envoyé, aucun paiement réel activé.**

## Installation

Depuis le projet actuel, après avoir arrêté `npm run dev` :

```powershell
Expand-Archive "$HOME\Downloads\nashra-v3.3-quotas.zip" -DestinationPath . -Force
node .\install-v33.cjs
node .\verify-v33.cjs
node .\nashra-tests\entitlements-v33.test.cjs
npm run typecheck
```

L'installeur vérifie toutes les pièces de l'archive et refuse de remplacer un fichier non reconnu. Les fichiers modifiés sont sauvegardés dans `nashra-backups/v33-...`. `node_modules`, `.env.local` et les données Supabase ne sont pas modifiés.

### ATTENTION : erreur SQL `attempted_at` rencontrée précédemment

**Avant d'exécuter SQL 009**, ouvrez `supabase/DIAGNOSTIC_MIGRATIONS.sql` et exécutez son contenu dans Supabase SQL Editor. Les **quatre colonnes du résultat doivent être `true`**. Si `migration_005_attempted_at=false`, le SQL `005_delivery_worker.sql` doit d'abord être appliqué et sa réussite vérifiée ; puis le SQL `008_queue_reliability.sql` doit être appliqué. Ne passez pas à 009 si une dépendance manque. Le script 009 s'arrête avec une erreur explicite si les migrations prérequises ne sont pas complètes.

Puis :

```powershell
code .\supabase\009_subscription_limits.sql
```

Copiez le SQL dans l'éditeur Supabase et exécutez-le. Une exécution répétée ne supprime pas vos opérations.

### Stripe TEST (optionnel)

Conserver les paramètres du mode test (`NASHRA_BILLING_ENABLED=1`, clé `sk_test_...`). Pour reconnaître les plans, configurer **uniquement sur le serveur** :

```text
STRIPE_TEST_PRICE_ID=price_...            # Pro test
STRIPE_TEST_BUSINESS_PRICE_ID=price_...   # Business test, si utilisé
```

Ne mettez pas les secrets Stripe dans `NEXT_PUBLIC_*`. Ne collez jamais ces clés dans un chat. Le Checkout historique n'expose qu'un prix (`STRIPE_TEST_PRICE_ID`) : le plan Business est préparé côté données mais nécessite encore un parcours d'achat spécifique. Un abonnement déjà actif peut nécessiter un nouveau webhook de test vérifié pour initialiser `nashra_entitlements`.

## Limites et vérifications

- Cette mise à jour n'applique **que le plafond des opérations en attente**. Elle ne limite pas encore le nombre de comptes Telegram, le nombre d'annonces, les publications historiques ou les budgets d'usage.
- Pour valider réellement le SQL, les webhooks et les politiques RLS, il faut tester avec une base Supabase de **développement**, pas de production. Les tests inclus sont statiques et unitaires, **pas** des tests d'intégration Supabase/Stripe.
- Le moteur serveur V2.4 reste désactivé tant que ses drapeaux d'activation sont à `0`.
- Aucun site commercial ni tutoriel interactif du dashboard : ils sont prévus en phase finale.
