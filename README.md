# NASHRA V0.3 — Comptes utilisateurs + sauvegarde cloud

**Cette version ajoute de vrais comptes e-mail/mot de passe Supabase, une validation e-mail (si activée dans Supabase), une page de connexion au design Nashra, la déconnexion, et la synchronisation des annonces/destinations/campagnes/historique entre appareils du même utilisateur.** Les comptes sont isolés en base par les politiques RLS PostgreSQL.

Elle reprend également la v0.2 : les tests Telegram manuels **uniquement en développement local** via un bot autorisé. Les campagnes planifiées restent des simulations. **Ne la commercialise pas ni ne la déploie en production avec les fonctions Telegram activées.**

## Installation rapide (Windows)

Node.js 22+ requis. Décompresser `nashra-v0.3.zip` dans `C:\Users\<vous>\`. Cette V0.3 est installée dans son propre dossier `nashra-v0.3` pour ne **pas mélanger** les anciennes routes Next.js du projet V0.2.

```powershell
cd "$HOME\nashra-v0.3"
npm install
Copy-Item .env.example .env.local
notepad .env.local
```

Crée ton projet sur https://supabase.com/dashboard.
Dans **Project settings / Connect**, récupère :

- **Project URL** -> `NEXT_PUBLIC_SUPABASE_URL`
- **Publishable key** -> `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (ou une clé publique `anon` si ton projet utilise ce modèle)

**Ne jamais utiliser la clé `service_role` ni de clé secrète dans `NEXT_PUBLIC_` !**

Dans Supabase -> **SQL Editor**, copie/colle puis exécute **`supabase/001_workspaces.sql`**. Les politiques RLS empêchent chaque utilisateur de lire ou modifier les données des autres.

Dans Supabase -> **Authentication -> URL Configuration** :
- `Site URL` : `http://localhost:3000`
- Ajouter comme `Redirect URL` : `http://localhost:3000/auth/callback` (puis ajouter ton domaine HTTPS au moment d'un déploiement).

Dans Supabase -> **Authentication -> Providers -> Email** : vérifier que la méthode e-mail est activée et choisir si la confirmation e-mail est obligatoire (recommandé).

```powershell
npm run dev
```

Ouvre `http://localhost:3000/connexion`, crée ton compte et confirme l'e-mail si nécessaire. Connecte-toi, puis ajoute des annonces : elles sont enregistrées dans ton espace cloud (pastille « Cloud synchronisé » en haut). Sur un autre appareil connecté au même compte, les données se chargent depuis Supabase.

### Démarrer la démo sans Supabase

Si les variables Supabase sont absentes, l'app conserve sa **démo locale** v0.2. Les données restent dans `localStorage`. Une fois Supabase configuré et un compte créé, **Paramètres > Importer l'ancienne démo** copie explicitement les anciennes données dans le cloud ; il faut l'autoriser et cela **remplace** le contenu du compte cloud courant. Le bouton « Exporter mes données » permet de télécharger une sauvegarde JSON avant toute opération.

### Telegram : toujours un test local et limité

Pour reprendre les tests manuels de la v0.2 :

```dotenv
NASHRA_LOCAL_DEV=1
TELEGRAM_BOT_TOKEN=ton_token_BotFather
NASHRA_DEV_USER_ID=uuid_de_ton_compte_supabase
# Facultatif : NASHRA_DEV_TELEGRAM_USER_ID=ton_identifiant_numerique_telegram
```

Les routes de bot sont indisponibles en production : elles ne gèrent **qu'un seul bot configuré par le développeur** et ne conviennent pas à plusieurs clients. Si Supabase est configuré, `NASHRA_DEV_USER_ID` est **obligatoire** pour ces tests locaux : récupère ton UUID dans **Supabase > Authentication > Users**, copie-le dans `.env.local`, redémarre. Les autres comptes Nashra ne pourront pas invoquer les routes Telegram locales. Le compte Nashra et le compte Telegram sont deux choses distinctes. Ne partage jamais ton jeton, et ne l'ajoute pas au navigateur.

Seuls les groupes/canaux ayant autorisé le bot peuvent recevoir ces messages. Les messages d'origine protégés ne peuvent pas être copiés/transférés. La synchronisation `getUpdates` consomme les messages reçus par ce bot et ne doit pas fonctionner en parallèle d'un webhook.

## Limites à connaître avant une commercialisation

- Données du MVP dans **une ligne JSONB par utilisateur**. RLS sécurise l'isolation, mais un travail sur deux appareils **simultanément** peut remplacer des modifications (dernier enregistrement gagnant). Avant une vraie sortie publique : tables normalisées (`announcements`, `destinations`, `campaigns`, `deliveries`), contrôles d'intégrité et gestion des conflits.
- Les campagnes restent une **simulation**, aucun worker/cron ne les exécute encore.
- Pas encore de liaison Telegram par client, ni gestion du bot token chiffré par compte, ni files de publication, ni gestion d'albums complets.
- Pour un vrai SaaS : quotas, surveillance des erreurs, contrôles anti-abus, billing, protection des secrets, sécurité de publication, conditions et conformité Telegram.
- La connexion Internet est nécessaire pour l'authentification et la sauvegarde cloud.

## Vérification

```powershell
npm run typecheck
npm run build
```

**Tests manuels recommandés** : inscription/connexion, sauvegarde puis rechargement, déconnexion/reconnexion, connexion au second compte avec espace vide, refus par RLS d'une requête utilisant l'`user_id` de l'autre compte, export/import des anciennes données, test du bot uniquement en local.
