# NASHRA — Gestion des abonnements : une mise à jour ciblée

Cette mise à jour concerne UNIQUEMENT **Abonnement** et ses routes de paiement.
Elle ne touche ni aux annonces, ni à Telegram, ni au calendrier, ni au profil, ni au tutoriel.

## Fonctionnement
- **Gratuit** : 100 opérations simultanément en attente.
- **Pro** : 300 opérations simultanément en attente.
- **Business** : 500 opérations simultanément en attente.
- Il ne s'agit **pas** d'un quota mensuel de messages. Ces limites existaient déjà dans la migration SQL 009.
- Page Mon abonnement accessible dans **Avatar → Abonnement** : trois offres, prix et devise récupérés en direct depuis les identifiants de prix Stripe (aucun prix inventé), forfait réel provenant de Supabase, prochaine échéance, gestion/résiliation via le portail Stripe. Le menu avatar affiche le forfait provenant du serveur au lieu d’un « Gratuit » fictif.
- Checkout Pro ET Business ; vérification du prix récurrent sur le serveur.
- Webhook Stripe signé, vérification de l'environnement (test/live), relecture de la souscription depuis Stripe, fonction SQL atomique pour ne pas perdre les droits sur événements désordonnés ou rejoués.
- Les 11 langues de Nashra sont conservées, avec les textes d'abonnement traduits.
- Le quota de publication n'est PAS élargi aux messages immédiats : aucune restriction cachée n'est ajoutée à la fonctionnalité Telegram principale.

## Installation sous PowerShell dans le dossier de ton projet

Télécharger le ZIP, le placer dans Téléchargements, puis arrêter le serveur Next.js (`Ctrl + C`) :

```powershell
Expand-Archive "$HOME\Downloads\nashra-abonnements.zip" -DestinationPath . -Force
node .\install-abonnements.cjs
node .\verify-abonnements.cjs
npm run typecheck
npm run build
```

L'installateur vérifie chaque ancienne version du fichier **avant de remplacer quoi que ce soit**. Il sauvegarde les fichiers remplacés dans `nashra-backups/billing-...`. S'il indique un conflit, arrête-toi et n'écrase pas tes modifications.

Dans **Supabase > SQL Editor**, exécuter **après 006 et 009** le fichier :
`supabase/014_billing_subscriptions.sql`

**La migration SQL est requise pour les nouvelles routes de paiement.** Elle n'active pas les paiements.

## Configuration Stripe TEST (0 € débité)

Dans `.env.local` sur ton ordinateur (ne jamais communiquer les clés) :

```dotenv
NASHRA_BILLING_ENABLED=1
NASHRA_BILLING_MODE=test
NASHRA_APP_URL=http://localhost:3000
STRIPE_SECRET_KEY=sk_test_VOTRE_CLE
STRIPE_WEBHOOK_SECRET=whsec_VOTRE_SECRET_DE_TEST
STRIPE_TEST_PRICE_ID=price_VOTRE_PRO
STRIPE_TEST_BUSINESS_PRICE_ID=price_VOTRE_BUSINESS
SUPABASE_SERVICE_ROLE_KEY=VOTRE_CLE_SERVER_SEULEMENT
```

Configurer dans Stripe **2 produits à prix récurrent** (un pour Pro, un pour Business), puis le portail client et un webhook de test vers `/api/billing/webhook` pour `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`. Le webhook doit pouvoir atteindre ton serveur (localhost nécessite Stripe CLI ou un tunnel sûr). Ne pas confondre webhook de test et live.

L'URL `NASHRA_APP_URL` doit être l'origine exacte ouverte dans le navigateur. Après un retour du Checkout, **la confirmation n'est pas immédiate** : elle est enregistrée après réception et validation du webhook. Un paiement ne se prouve jamais par `?retour=succes`.

## Option de paiement réel, seulement après vérification commerciale et technique

Cette intégration sait utiliser un environnement Stripe LIVE mais il est **désactivé par défaut**. Il faut un compte Stripe autorisé pour l'entreprise concernée, des prix récurrents LIVE, un webhook LIVE, un site et des conditions commerciales en règle, et explicitement :

```dotenv
NASHRA_BILLING_ENABLED=1
NASHRA_BILLING_MODE=live
NASHRA_BILLING_LIVE_CONFIRM=I_ACCEPT_REAL_CHARGES
STRIPE_SECRET_KEY=sk_live_VOTRE_CLE
STRIPE_WEBHOOK_SECRET=whsec_SECRET_LIVE
STRIPE_LIVE_PRO_PRICE_ID=price_VOTRE_PRO_LIVE
STRIPE_LIVE_BUSINESS_PRICE_ID=price_VOTRE_BUSINESS_LIVE
NASHRA_APP_URL=https://votre-vrai-domaine.example
```

**Ne passe PAS en LIVE tant que les paiements tests, l'annulation, le passage Pro→Business et le déploiement du webhook ne sont pas validés.** La migration ne met aucun compte au statut Pro/Business manuellement.

**Attention** : Stripe n'accepte pas à ce jour l'ouverture directe d'un compte marchand pour une entreprise enregistrée en Arabie saoudite. L'éligibilité dépend du pays réel d'établissement de l'entreprise. S'il faut un autre prestataire de paiement, n'active pas le LIVE de Stripe : le paiement doit alors être adapté au prestataire retenu.

## Tests techniques dans le ZIP

```powershell
node --test .\nashra-tests\billing.test.cjs
```

Les tests couvrent notamment les modes test/live, les signatures, les droits, les traductions et le SQL. **Ils ne remplacent pas un paiement Stripe de test ni une compilation sur ton projet.**
