# NASHRA — BUNDLE V2.5 + V2.6 + V2.7

Ce ZIP regroupe **trois modules distincts** dans une seule installation :

1. **V2.5 – Centre des opérations** (`/operations`) : métriques personnelles, recherche/filtre, détection des tentatives bloquées ou incertaines, export CSV protégé contre les formules, liens vers la file d'attente. Lecture seule ; aucune relance automatique.
2. **V2.6 – Facturation Stripe TEST** (`/abonnement`) : statut d'abonnement, Checkout test, portail client test, webhook à signature vérifiée, stockage Supabase et RLS. **Aucun paiement réel ni forfait monétisé** ; quotas de plans non implémentés. Stripe désactivé sans activation volontaire.
3. **V2.7 – Administration** (`/admin`) : métriques globales agrégées de la file, nombre de connexions Telegram et d'abonnements actifs en test. Accès REST protégé par `NASHRA_ADMIN_USER_IDS` listant des UUID d'utilisateurs Supabase, pas des e-mails. Jamais de clés/session Telegram affichées.

**Prérequis** : Nashra V2.4 installée, SQL 004 et SQL 005 exécutés, projet Next.js et dépendances existantes. Aucun package npm supplémentaire.

## Installation — PowerShell dans le dossier déjà ouvert

```powershell
Expand-Archive "$HOME\Downloads\nashra-v2.5-v2.7-bundle.zip" -DestinationPath . -Force
node .\install-bundle-v27.cjs
npm run typecheck
```

Le script effectue un contrôle avant d'écrire, crée des sauvegardes des fichiers modifiés et refuse d'écraser les nouveaux fichiers s'ils ont un autre contenu. Sur la sidebar, il ajoute « Opérations » et « Abonnement ». La page file d'attente contient aussi un raccourci vers Opérations.

**Puis exécutez** `supabase/006_billing_ops.sql` dans Supabase → SQL Editor ; il crée `nashra_subscriptions` avec RLS de lecture personnelle et aucun droit d'écriture utilisateur. Ce SQL n'active pas le moteur de publication.

Relancez ensuite `npm run dev -- --port 3000`. Vérifiez `/operations`, `/abonnement` et `/api/health`.

## Administration facultative

Sur votre environnement **serveur uniquement** (jamais en `NEXT_PUBLIC_`) :

```dotenv
# Identifiants UUID Supabase Auth, séparés par virgules (exemple fictif)
NASHRA_ADMIN_USER_IDS=00000000-0000-0000-0000-000000000000
```

La route `/admin` affiche « accès réservé » si votre compte n'est pas explicitement autorisé. Requiert `SUPABASE_SERVICE_ROLE_KEY` côté serveur. Le rôle service Supabase contourne les RLS : ne le partagez jamais.

## Stripe : mode TEST uniquement et désactivé par défaut

Si vous souhaitez essayer Stripe, créez d'abord un **Price récurrent en mode test** dans Stripe. Configurez sur le **serveur uniquement** :

```dotenv
NASHRA_BILLING_ENABLED=1
NASHRA_APP_URL=http://localhost:3000
STRIPE_SECRET_KEY=sk_test_VOTRE_CLE_TEST
STRIPE_TEST_PRICE_ID=price_VOTRE_PRIX_RECURRENT_TEST
STRIPE_WEBHOOK_SECRET=whsec_VOTRE_SECRET_WEBHOOK_TEST
```

Pour un déploiement, `NASHRA_APP_URL` doit être une URL HTTPS correspondant exactement à votre application. Le checkout est désactivé si la clé ne commence pas par `sk_test_`. `sk_live_` est explicitement refusé, quelle que soit la configuration.

Configurez dans Stripe (mode test) un endpoint `POST /api/billing/webhook` avec ces événements :

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Pour tester localement, Stripe CLI peut transférer les webhooks à `http://localhost:3000/api/billing/webhook` ; récupérez le secret `whsec_...` affiché dans votre terminal Stripe CLI. Ne partagez pas vos clés.

**Limites importantes** : la synchronisation webhook doit être testée en conditions réelles (événements réordonnés, reprise de souscription, flux portail). Les quotas gratuits/Pro/Business ne sont pas encore appliqués ; aucune vente en production ne doit être proposée à cette étape. Les prix ne sont pas inventés : ils viennent de votre configuration Stripe test. Réservez cette fonction aux tests.

## Fiabilité et restrictions

- Les métriques d'Opérations portent sur les **500 tâches les plus récentes**, pas l'historique exhaustif.
- Les tâches `processing` depuis plus de 15 minutes ou `approved` avec plus de 24h de retard sont signalées **sans modification de leur état**.
- Les tâches `needs_review` et `blocked` ne sont jamais redémarrées automatiquement.
- La V2.4 publie uniquement un message source simple après approbation. Albums Telegram multi-messages non pris en charge par ce moteur.
- Envoi Telegram désactivé tant que `NASHRA_AUTOMATION_ENABLED=1`, `NASHRA_PUBLISHING_ENABLED=1` et Cron n'ont pas été configurés séparément.
- Cette mise à jour n'installe aucun Cron ni n'active la publication. Respectez les permissions des groupes et les règles Telegram.
- La version ne finalise pas les 11 langues ; les nouveaux écrans sont **en français**, à traduire plus tard.

## Contrôles locaux

`node .\verify-bundle-v27.cjs` effectue des vérifications de présence et de syntaxes des fichiers TS/TSX lorsqu'il trouve TypeScript installé. Puis lancez `node .\test-signature-v27.cjs` pour vérifier la signature des webhooks avec des données fictives et faites `npm run typecheck`. Certaines erreurs venant de copies de sauvegarde anciennes devront être exclues via tsconfig sans les supprimer.

**Pas de déploiement de production ni de paiements live avant audit des flux, tests de sécurité/RLS, test de webhook Stripe et tests complets de publication en groupe contrôlé.**
