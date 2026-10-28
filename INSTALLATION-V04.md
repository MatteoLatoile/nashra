# Nashra V0.4 — compte personnel Telegram (sans bot)

Cette version **remplace les opérations Telegram par bot** par l'API Telegram MTProto (teleproto) utilisant votre propre compte. Chaque personne connectée à son compte Nashra/Supabase gère une session Telegram distincte.

## Mise à jour sans perdre la V0.3

Le ZIP contient le dossier `nashra-v0.3` : il doit être décompressé **dans le dossier utilisateur Windows** (`C:\Users\matte` dans l'exemple), en remplaçant le code existant. **Le ZIP ne contient pas `.env.local`**, votre configuration actuelle est préservée.

Dans PowerShell, après arrêt du serveur Next.js (Ctrl+C) :

```powershell
cd $HOME
Expand-Archive "$HOME\Downloads\nashra-v0.4.zip" -DestinationPath $HOME -Force
cd "$HOME\nashra-v0.3"
npm install
```

## 1. Configuration Supabase

Dans Supabase > SQL Editor, exécutez `supabase/002_telegram_accounts.sql`. Ce script est indépendant de `001_workspaces.sql`. Il crée une table de sessions **chiffrées** avec accès limité par utilisateur (RLS).

## 2. Configuration Telegram développeur

Accédez à https://my.telegram.org > **API development tools**, connectez votre numéro, créez une application et récupérez `api_id` et `api_hash`. Ce **n'est pas** un token BotFather.

Ne publiez jamais `api_hash`, la session Telegram, les codes reçus ou vos secrets de chiffrement. Vous n'avez pas à communiquer ces données à qui que ce soit.

Ajoutez à votre `.env.local` existant :

```env
TELEGRAM_API_ID=VOTRE_API_ID
TELEGRAM_API_HASH=VOTRE_API_HASH
NASHRA_SESSION_ENCRYPTION_KEY=VOTRE_CLE_HEX_64_CARACTERES
```

Pour générer votre clé unique (à conserver), exécutez :

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copiez les 64 caractères dans `NASHRA_SESSION_ENCRYPTION_KEY` et sauvegardez le secret. Si vous le changez, les sessions existantes seront illisibles et les utilisateurs devront se reconnecter. Les anciennes routes Bot API renvoient désormais HTTP 410 et ne peuvent plus publier. Les anciennes variables `TELEGRAM_BOT_TOKEN`, `NASHRA_LOCAL_DEV`, etc. sont inutilisées dans le nouveau module et peuvent être supprimées. Ne placez pas les nouveaux secrets dans `NEXT_PUBLIC_`.

## 3. Démarrer

Dans le bon dossier (`nashra-v0.3`) :

```powershell
npm run dev -- --port 3000
```

Ouvrez http://localhost:3000/telegram, connectez **votre propre compte** avec votre numéro, le code Telegram et, si nécessaire, le mot de passe de vérification en deux étapes.

Choisissez une conversation source et un message, puis un groupe où vous êtes **autorisé** à publier. Confirmez les règles du groupe dans l'interface. Le bouton d'envoi permet un transfert ou une republication **manuelle et unitaire** depuis votre compte.

## Ce qui est en place / ce qui reste à faire

- Connexion par numéro / code / mot de passe 2FA via teleproto. Sur certains comptes Telegram, une validation par e-mail peut être demandée : elle n’est pas encore gérée dans cette V0.4.
- Sessions chiffrées AES-256-GCM stockées dans Supabase (une par utilisateur).
- Récupération des 200 conversations récentes et des 40 derniers messages d'une conversation.
- Import dans la bibliothèque Nashra et transferts/publications manuels unitaires depuis le compte personnel.
- Contrôle serveur : seuls les groupes déclarés autorisés dans l'espace utilisateur peuvent recevoir des envois. Les restrictions Telegram continuent de s'appliquer.
- **Pas encore** de planification automatique, ni worker cloud, ni gestion des albums/médias avancés, ni synchronisation Telegram temps réel.

Cette V0.4 est un socle de développement, **pas un SaaS prêt pour des clients**. Avant la commercialisation : audit de sécurité, contrôle de taux et des abus, infrastructure backend Node permanente, reprise des tâches, gestion des erreurs et consentement des clients. Déployer les routes MTProto sur un worker Node persistant plutôt que comme des fonctions serverless courtes.

Telegram interdit le spam et peut limiter ou bannir les comptes utilisant son API pour des diffusions non sollicitées. Nashra ne doit servir qu'à partager des contenus là où c'est autorisé.
