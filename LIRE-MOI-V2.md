# Nashra V2.0 — Mise à jour groupée

Ce correctif a été préparé à partir de **`nashra-source.zip`**, la copie réelle du projet fournie par l'utilisateur. Il ne remplace pas le projet entier. Il modifie uniquement les fichiers listés dans `manifest-v2.json` et **vérifie le SHA-256 de chacun avant toute écriture**. En cas de différence avec les fichiers originaux transmis, l'installation s'arrête sans rien écraser.

## Installation (PowerShell dans le dossier Nashra ouvert dans VS Code)

Arrêter Next.js avec `Ctrl+C`, télécharger le ZIP, puis :

```powershell
Expand-Archive "$HOME\Downloads\nashra-v2.0-patch.zip" -DestinationPath . -Force
node .\install-v2.cjs
node .\verify-v2.cjs
npm run typecheck
npm run dev -- --port 3000
```

Si le ZIP se télécharge sous un nom différent, adapter uniquement le chemin de la première commande. L'installateur crée des copies des fichiers précédents dans `nashra-backups/v2.0-...` ; pas de modification de `.env.local`, pas de suppression des données.

## Changements effectifs

1. **Bibliothèque /annonces** : ajout de photos par fichier ou URL dans deux onglets ; galerie de miniatures avec suppression du brouillon ; aperçu direct avant sauvegarde ; boutons d'action visibles dans la modale ; conservation des fonctions V1.2 (catégories, tags, filtres, duplication, édition).
2. **Telegram /telegram** : import EXPLICITE du texte du message personnel et des photos d'album accessibles, maximum 10 photos JPG/PNG/WebP, 8 Mo chacune, vers Supabase Storage ; affiche les formats ignorés/erreurs ; détection des imports déjà présents. Aucun message n'est envoyé par l'import.
3. **Campagnes /campagnes** : export calendrier `.ics` des **prochains créneaux actifs** pour Outlook, Google Agenda, etc., sous forme de rappels de préparation. Les campagnes et l'agenda existants ne sont pas supprimés. Aucun envoi Telegram automatique.
4. **Tableau de bord /** : état des trois éléments configurés, activité des 7 derniers jours, nombre de publications manuelles et campagnes à revoir.
5. **Destinations /groupes** : modification des fiches et autorisations déjà enregistrées, sans les supprimer ; distinction plus honnête entre identifiants Telegram numériques et destinations manuelles.
6. **Historique /historique** : recherche, filtre des publications réelles et export CSV (avec précaution contre les formules dangereuses).
7. **Langues** : 35 entrées d'interface nouvelles ou améliorées dans le catalogue des 11 langues existantes. Certaines phrases dynamiques et textes hérités restent en français et devront être traités ultérieurement ; **pas une traduction exhaustive de toutes les pages**.
8. **Compilation** : le `tsconfig.json` limite désormais l'analyse à `src/` et aux types Next, afin d'éviter les fausses erreurs causées par les anciens dossiers de sauvegarde.

## Prérequis Telegram / Supabase

- Connecter son **compte personnel Telegram** via l'écran existant.
- `TELEGRAM_API_ID`, `TELEGRAM_API_HASH` et `NASHRA_SESSION_ENCRYPTION_KEY` doivent déjà être configurés pour la connexion (non modifiés par ce patch).
- Exécuter le **script existant** `supabase/003_announcement_images.sql` une fois dans le SQL Editor Supabase pour créer le bucket `nashra-announcement-images` et la politique d'écriture par utilisateur. Le correctif ne réexécute pas de SQL.
- Le bucket est **public par URL**. Ne pas importer de documents confidentiels, d'identifiants ou de photos privées.
- L'import photo dépend de la disponibilité du réseau, des droits d'accès du compte personnel aux messages et des limites de Telegram / de l'hébergeur. Certains médias non photographiques ne sont pas pris en charge. Les albums sont détectés parmi les 29 identifiants voisins et peuvent être partiels s'ils sont exceptionnellement dispersés.
- L'import de médias n'est jamais une publication ; **les campagnes restent des rappels nécessitant une action manuelle.** Telegram peut restreindre les envois. Respectez les permissions de chaque groupe ; ce correctif ne contourne aucune restriction.

## Validation et limites

Contrôles effectués lors de la création du patch : analyse syntaxique/transpilation TypeScript de 48 fichiers `.ts/.tsx`, test unitaire de génération du calendrier ICS, validation du JSON et du manifeste d'intégrité. **Pas de test en direct** avec votre Supabase, votre compte Telegram ou un serveur Next.js, et **pas de `npm run typecheck` complet** dans l'environnement de préparation car les dépendances npm n'y étaient pas téléchargeables. La compilation et les tests d'intégration doivent être faits sur votre ordinateur.

### Tests fonctionnels rapides

- `/annonces` → Nouvelle annonce → importer 2 photos → les retirer → ajouter une URL → aperçu → sauvegarder → modifier.
- `/telegram` → Charger les conversations → sélectionner message avec photo ou album → « Importer texte et photos » → vérifier les images dans `/annonces` ; vérifier aussi un message uniquement textuel.
- `/campagnes` → créer un créneau futur → « Exporter mon calendrier » → ouvrir le fichier `.ics` ; vérifier qu'aucun envoi Telegram n'a été déclenché.
- `/groupes` → modifier une fiche existante → vérifier qu'elle reste dans les campagnes.
- `/historique` → rechercher et exporter CSV.
- `/` → consulter les nouvelles métriques et le statut des campagnes.
- `/parametres#langue` → basculer en arabe, russe, anglais, ourdou et vérifier l'alignement RTL.

## Hors périmètre de cette V2.0

- Pas de programmation serveur qui poste automatiquement des messages Telegram.
- Pas d'import de vidéos / documents / audio, et aucun support de messages privés inaccessibles.
- Pas de paiements, landing page marketing ou application Windows dans ce patch.
- Pas de tutoriel interactif du dashboard : **il est volontairement réservé à la fin du projet.**
