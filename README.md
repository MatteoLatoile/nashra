# Nashra — Landing page publique

Une page marketing au chemin `/` : présentation de la plateforme, aperçu des campagnes récurrentes multi-groupes, fonctionnalités, étapes d’utilisation, trois offres ($0 / $8 / $19 par mois ou $0 / $80 / $190 par an), FAQ et appels à l'action.

Le **dashboard privé** anciennement sur `/` est déplacé vers `/dashboard`. Les redirections de connexion, liens internes et parcours du tutoriel sont adaptés. Les API, quotas, sessions Telegram, calendrier, profil, traduction et base Supabase ne sont pas modifiés.

## Installer dans PowerShell, à la racine de Nashra

1. Télécharger le ZIP dans Téléchargements.
2. Exécuter :

```powershell
Expand-Archive "$HOME\Downloads\nashra-landing-page.zip" -DestinationPath . -Force
node .\install-landing.cjs
node .\verify-landing.cjs
npm run typecheck
npm run build
npm run dev -- --port 3000
```

Ouvrir `http://localhost:3000/` pour la landing page. L'espace connecté se trouve sur `http://localhost:3000/dashboard`.

## Bouton Télécharger

**Il n’existe pas d’installeur Windows/macOS dans les sources du projet inspectées.** Le bouton Télécharger est donc présent mais étiqueté « Bientôt » tant qu'aucun fichier installable n'est publié. La plateforme web est immédiatement accessible par « Commencer gratuitement ».

Quand un installateur fiable existe et qu'il est hébergé sur un domaine HTTPS, configurer dans `.env.local` :

```dotenv
NEXT_PUBLIC_NASHRA_DOWNLOAD_URL=https://votre-domaine.example/downloads/Nashra-Setup.exe
```

Redémarrer puis rebâtir l'application : la variable `NEXT_PUBLIC_` est publique et intégrée au build. N'indiquer que des URL fiables. Il ne faut **pas** mettre des secrets dans cette variable.

## Déploiement et paiements

Les prix et quotas sur le site reflètent les décisions commerciales, mais **l'intégration Stripe n'est pas activée par cette mise à jour**. Les boutons Pro et Business mènent à `/connexion` pour explorer Nashra ; l'ouverture des paiements attendra la validation du mode LIVE. La page indique clairement que les souscriptions payantes restent en test. La gestion des récurrences au-delà des messages déjà programmés exige toujours un service serveur disponible.

## Sauvegarde / compatibilité

L'installateur crée `nashra-backups/landing-<date>` avec les fichiers sources précédents et `nashra-landing-install.json` avec les chemins concernés. Il refuse de supprimer/écraser une page existante inattendue ou de patcher un code dont les marqueurs diffèrent : en cas d'erreur, **ne pas forcer l'installation**. Il ne modifie pas `.env.local` ni la base de données.

## Vérifications

- `node .\verify-landing.cjs` : cohérence statique des nouvelles routes.
- `npm run typecheck` : validation TypeScript.
- `npm run build` : compilation Next.js.
- Vérifier sur PC et mobile : `/`, `/connexion`, `/dashboard`, `/annonces`, `/campagnes`, les offres et le menu, ainsi que la possibilité de relancer le tutoriel depuis l'avatar.

## Contexte langues

Le contenu de la nouvelle **page publique** est en français pour cette première livraison. Le système de 11 langues existant dans l’espace connecté est laissé intact. Les traductions complètes de la landing page ne sont pas incluses dans ce correctif.

### Annulation si besoin

Après installation, tant que les fichiers n'ont pas été modifiés à nouveau :

```powershell
node .\rollback-landing.cjs
```

Le script restaure les fichiers sauvegardés et l'ancien tableau de bord sur `/`.
