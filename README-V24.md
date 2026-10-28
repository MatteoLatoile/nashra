# Nashra V2.4 — Worker Telegram avec consentement par tâche

**Ce correctif ajoute un moteur capable d'envoyer un message Telegram depuis le compte personnel de l'utilisateur, mais aucun envoi n'est activé par défaut.**

## Prérequis
- V2.3 installée et migration `supabase/004_delivery_queue.sql` exécutée.
- Connexion Telegram personnelle fonctionnelle et sans restriction, destinations où l'utilisateur est autorisé à publier.
- Déploiement Next.js avec fonctions serveur Node.js persistantes et déclenchement Cron fiable.
- Configuration V0.4 : `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `NASHRA_SESSION_ENCRYPTION_KEY`.

## Installation locale

```powershell
Expand-Archive "$HOME\Downloads\nashra-v2.4-worker.zip" -DestinationPath . -Force
node .\install-v24.cjs
npm run typecheck
```

**Important :** Avant tout envoi, exécuter `supabase/005_delivery_worker.sql` dans Supabase SQL Editor. La migration renforce les autorisations de mise à jour de `delivery_queue`, ajoute `approved`, `processing`, `sent`, `blocked` et `needs_review`, et installe une fonction RPC de réclamation atomique limitée au rôle serveur.

Après redémarrage, dans `/file-attente`, les utilisateurs pourront approuver individuellement chaque opération future. Le nouveau worker ne publiera RIEN tant que les conditions ci-dessous ne sont pas remplies.

## Activation explicite côté serveur uniquement

Les variables **secrètes** ci-dessous doivent être configurées uniquement sur l'hébergeur backend, jamais en `NEXT_PUBLIC_` ni dans Git. Sur une instance locale, on peut les définir dans `.env.local` (ne pas partager le fichier).

| Variable | Utilité |
| --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé Supabase secret/service-role. Elle contourne RLS : ne jamais l'exposer au navigateur. |
| `NEXT_PUBLIC_SUPABASE_URL` | URL du projet Supabase déjà utilisé par Nashra. |
| `CRON_SECRET` | Secret d'au moins 32 caractères, pour sécuriser `/api/cron/nashra`. |
| `NASHRA_PUBLISHING_ENABLED=1` | Autorise les envois manuels déjà existants ; pour V2.4 également requis. |
| `NASHRA_AUTOMATION_ENABLED=1` | Autorise explicitement l'exécution du worker V2.4. |

Ne mettez les deux derniers drapeaux à `1` **qu'après** vos vérifications. Toute autre valeur désactive le worker. Le Cron doit appeler **GET `/api/cron/nashra`** avec `Authorization: Bearer <CRON_SECRET>` ; Vercel Cron peut le faire avec `CRON_SECRET` correctement configuré (selon les limites de votre offre). La mise à jour n'ajoute pas de tâche Cron d'elle-même ; elle ne déclenche donc aucune exécution périodique sans configuration.

## Protections et limites
- Toute nouvelle opération est `held`. L'utilisateur doit cliquer **Approuver l'envoi** pour chaque tâche future (avant la date prévue). Il peut annuler tant que l'opération n'est pas en cours.
- Le worker revendique **au maximum un job par appel** et seulement une fois sa date arrivée.
- Intervalle minimum de **10 minutes par compte personnel** et **60 minutes par destination** à partir des tentatives. Cela ne garantit pas l'absence de restriction Telegram, et ne permet jamais de contourner leurs limites.
- Vérification côté serveur, au dernier moment, de la campagne, de la source, de la destination, du statut de campagne, des identifiants et de l'autorisation explicitement enregistrée. Telegram peut encore refuser l'envoi.
- Les tentatives incertaines sont marquées `needs_review`, sans redémarrage ni nouvelle tentative automatique. Si le worker est interrompu au mauvais moment, une tâche peut rester `processing` : **vérifier manuellement Telegram**. Ne pas relancer à l'aveugle.
- Les opérations de plus de 24 heures ne sont pas revendiquées et restent `approved`. Elles doivent être annulées manuellement. Aucune réactivation implicite.
- L'envoi porte sur **un seul message Telegram source**. Les albums multi-messages ne sont pas envoyés en entier par le worker V2.4.
- Les groupes doivent explicitement autoriser la publication. Aucune fonction d'évitement de blocages, d'ajout automatisé à des groupes ou de contournement des limitations Telegram.

## Vérification
1. `npm run typecheck` (s'il échoue sur un fichier de sauvegarde historique, résoudre l'exclusion TypeScript séparément).
2. Exécuter SQL 005 ; vérifier que `/file-attente` affiche les boutons **Approuver l'envoi**.
3. Vérifier les résultats de vos tests avec un **groupe de test que vous contrôlez**.
4. Garder `NASHRA_AUTOMATION_ENABLED=0` jusqu'à avoir installé Cron, configuré les secrets et autorisé explicitement les opérations.

Ni le build final Next.js ni l'envoi réel Telegram ne peuvent être certifiés à partir de ce patch sans les dépendances et credentials de votre environnement.
