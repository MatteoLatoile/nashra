# Nashra Desktop — vrai installeur Windows

Cette livraison ajoute **Electron + electron-builder (NSIS)** au projet Nashra existant. Elle **ne modifie pas** les fonctions annonces, Telegram, calendrier, abonnements ou la landing page.

## Ce qui est inclus

- `desktop/main.cjs` : fenêtre Windows pour Nashra, session persistante, navigation restreinte et page d'erreur réseau.
- `desktop/builder.config.cjs` : assistant d'installation NSIS **par machine**, dossier `C:\Program Files\Nashra` par défaut, raccourci bureau / menu Démarrer, désinstallation Windows.
- `desktop/scripts/prepare-build.cjs` : injection de l'**adresse publique** du serveur dans le binaire (jamais de clé secrète).
- `desktop/tests/desktop.test.cjs` : contrôles de sécurité/configuration.
- `desktop/assets/icon.ico` : icône Windows Nashra.

## Prérequis

Windows 10 ou 11, Node.js et npm, connexion Internet pour installer les dépendances.

L'application de bureau est un **client du SaaS**, pas une copie du serveur. Pour les utilisateurs finaux, Nashra doit être déployé sur un domaine HTTPS accessible publiquement : le client Electron affiche le véritable dashboard Next.js et communique avec les API hébergées. C'est essentiel pour **ne pas distribuer** les clés secrètes Supabase, Telegram ou Stripe dans un `.exe` et pour gérer les récurrences côté serveur.

### 1. Tester sur ton PC, immédiatement, sans déployer

Ouvre d'abord un terminal à la racine de Nashra :

```powershell
npm run dev -- --port 3000
```

**Dans un deuxième terminal VS Code**, toujours depuis la racine de Nashra :

```powershell
npm install --prefix .\desktop
npm run check --prefix .\desktop
npm run dev --prefix .\desktop
```

Nashra s'ouvre dans une **fenêtre d'application Windows séparée**. Si les anciens patches `landing` ne sont pas installés, adapte l'URL dans `desktop/runtime-config.json` (par ex. `/` au lieu de `/dashboard`) pour le test local.

### 2. Fabriquer le vrai installeur de test local

Tu peux générer et installer un `.exe` dès aujourd'hui, même sans site publié :

```powershell
npm run dist:win:local --prefix .\desktop
```

Le fichier apparaîtra dans `desktop-dist\Nashra-Test-Local-Setup-0.1.0-x64.exe`. Lance-le pour tester l'assistant d'installation, le chemin sous **Program Files**, les raccourcis et le désinstalleur.

**Attention :** le binaire « Test Local » affiche `http://localhost:3000/dashboard` et exige donc que `npm run dev -- --port 3000` continue à tourner. **Ne le distribue pas** comme version officielle.

### 3. Fabriquer l'installeur officiel (quand Nashra est en ligne)

Quand l'application Next.js est déployée sous un vrai domaine HTTPS, remplace ton URL :

```powershell
$env:NASHRA_DESKTOP_URL = 'https://ton-domaine.com/dashboard'
npm run dist:win --prefix .\desktop
```

Résultat : `desktop-dist\Nashra-Setup-0.1.0-x64.exe`. Cette fois, **aucun serveur local n'est requis chez le client** : l'application se connecte à ton Nashra hébergé via Internet.

> **Important :** ce script refuse volontairement de construire un binaire officiel sans URL HTTPS valide. Ne mets **jamais** `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `TELEGRAM_API_HASH`, `.env.local`, ni une session Telegram dans l'installateur.

### 4. Brancher le bouton « Télécharger » de la landing page

Héberge l'installateur officiel sur un espace de téléchargement HTTPS (par exemple un dépôt de versions contenant un fichier public, ou ton propre hébergement). Ensuite, configure dans l'environnement de ton site **au moment du build** :

```dotenv
NEXT_PUBLIC_NASHRA_DOWNLOAD_URL=https://ton-domaine.com/downloads/Nashra-Setup-0.1.0-x64.exe
```

Reconstruis ou redéploie la landing page. Son bouton **Télécharger** pointe déjà vers cette variable si le patch landing est bien installé.

## Comportement Windows

- Installation guidée avec UAC pour installer dans `Program Files`.
- Raccourci bureau et menu Démarrer, entrée désinstaller dans les paramètres Windows.
- Stockage de session du navigateur Electron dans le profil Windows, pas dans `Program Files`.
- Ouvre les liens externes dans le navigateur Windows ; les pages Nashra restent dans l'application.
- Le paiement Stripe ouvert à l'extérieur du client peut nécessiter une nouvelle connexion navigateur. Tester ce parcours avant la mise en production.
- Quand Nashra est indisponible, affiche une page locale avec le raccourci `Ctrl+R` pour réessayer.
- **Ne contient pas** de moteur Telegram local. Publication et programmations continuent côté serveur Nashra, comme sur le web.

## Limites à connaître

1. Je n'ai pas compilé le `.exe` dans cet environnement Linux : le présent ZIP contient le **projet de l'installateur** ; le `.exe` est généré sur ton Windows via `npm run dist:win:local` puis `npm run dist:win`.
2. Un binaire non signé peut déclencher Microsoft Defender SmartScreen. **Ne pas distribuer publiquement** tant que l'installation et la réputation/la signature du logiciel n'ont pas été correctement traitées.
3. La mise à jour automatique n'est **pas** incluse. Pour l'instant, chaque version est remplacée par un nouvel installeur.
4. Les connexions OAuth / Stripe qui quittent Electron nécessiteront des tests de redirection sur le domaine public.
5. Il est possible de créer ultérieurement un vrai client hors-ligne, mais le fonctionnement SaaS (Telegram, Supabase, Stripe) requiert Internet.

## Vérifications

```powershell
npm run check --prefix .\desktop
```

Après génération de l'exécutable : Windows > Applications installées > Nashra ; `C:\Program Files\Nashra` ; bureau/Démarrer ; connexion ; création d'annonce ; envoi à un groupe autorisé ; calendrier ; abonnement test ; désinstallation.
