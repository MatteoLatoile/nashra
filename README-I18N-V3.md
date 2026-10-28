# Nashra — Internationalisation V3 (11 langues)

Cette mise à jour est **compatible avec le système de traduction existant** dans Nashra. Elle complète les nouvelles pages de la V2.1 à V2.7 et la bibliothèque d'annonces (V1.2/V2.0).

## Installation Windows / PowerShell

Fermer le serveur avec `Ctrl + C`. À la racine du projet `C:\Users\matte\nashra-v0.3` (terminal déjà ouvert dans ce dossier) :

```powershell
Expand-Archive "$HOME\Downloads\nashra-i18n-v3.zip" -DestinationPath . -Force
node .\install-i18n-v3.cjs
node .\verify-i18n-v3.cjs
npm run typecheck
npm run dev -- --port 3000
```

Ouvrir `http://localhost:3000/parametres#langue` et choisir une langue. Le choix **Automatique** utilise celle du navigateur/appareil. Testez l'arabe et l'ourdou pour la direction de lecture droite à gauche.

## Ce qui change

- **505 entrées de traduction** avec une valeur dans chacune des **10 langues cibles** (plus la source française), soit 11 langues au total dans la version source examinée.
- **193 nouvelles entrées** complètes ajoutées par rapport à la copie V2.7 utilisée pour préparer le correctif. Un catalogue déjà personnalisé peut afficher un autre nombre d'ajouts.
- Les pages **Opérations, Abonnement, Administration, File d'attente, Planification, Audit d'automatisation**, ainsi que **Annonces, Destinations et navigation** utilisent des libellés d'interface améliorés.
- Les dates des nouveaux écrans utilisent la locale sélectionnée ; les statuts et les titres des menus changent avec la langue.
- Les options de catégorie et de source gardent une `value` stable en français dans les données : seul l'intitulé visible est traduit. Cela évite de casser les filtres et l'enregistrement de données.
- Adaptations RTL supplémentaires pour le menu latéral, les panneaux et les tableaux.

Les traductions du catalogue ne modifient **jamais** les textes des annonces enregistrées, les identifiants Telegram, les messages des utilisateurs ou le contenu métier. Certaines chaînes dynamiques, erreurs renvoyées par une API et textes techniques anciens peuvent encore apparaître en français/anglais : faites remonter un exemple précis si vous en voyez. Le parcours de bienvenue avait déjà son propre module multilingue.

## Sécurité de l'installation

- Ne modifie pas les variables d'environnement ni Supabase SQL ; aucun envoi Telegram, aucun paiement.
- Sauvegarde les fichiers touchés sous `nashra-backups/i18n-v3-...`.
- Refuse de remplacer les neuf fichiers de code si leur SHA256 ne correspond pas à la copie V2.7 utilisée ou si un correctif a déjà été installé ; il affiche la liste des fichiers personnels préservés. Les traductions du catalogue, elles, sont ajoutées sans écraser les entrées préexistantes.
- Relancer le programme d'installation est sans effet sur une installation réussie.

**Vérifications réalisées avant livraison :** syntaxe TypeScript/TSX de 9 fichiers (avec TypeScript), installation sur copie de Nashra V2.7, deuxième installation sans duplication, complétude des 505 traductions. **Non vérifié :** build `npm run typecheck` complet sur le PC utilisateur et contrôle visuel de tous les écrans.

Le tutoriel interactif du dashboard reste prévu en fin de projet et n'est pas modifié ici.
