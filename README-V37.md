# Nashra V3.7 — Priorité : publier les photos et albums Nashra

**Correctif ciblé, sans nouvelle page, sans SQL et sans activation automatique.**

## Le problème réellement résolu

La V3.6 pouvait publier les brouillons texte, mais bloquait les annonces avec photos ajoutées directement dans Nashra. La V3.7 permet au worker serveur d'envoyer **une photo ou un album (2 à 10 photos)** provenant du bucket Supabase déjà utilisé par Nashra, avec une légende éventuelle (1 024 caractères maximum).

- Les photos doivent avoir été importées dans la bibliothèque de Nashra via l'ordinateur ou via l'import de médias Telegram V2, et présentes dans **le dossier Supabase Storage de l'utilisateur** (`nashra-announcement-images/<user UUID>/<photo UUID>.jpg|png|webp`).
- Les liens HTTPS externes ajoutés manuellement restent visibles en aperçu, mais **ne sont pas envoyés automatiquement**. Le worker les refuse pour éviter de télécharger des fichiers distants arbitraires (SSRF) et d'envoyer des photos imprévues. Réimporter ces photos dans le stockage Nashra est nécessaire.
- Avant tout contact avec Telegram, le worker télécharge et vérifie **toutes** les photos. Si une image manque, dépasse 8 Mo, est mal formée ou appartient à un autre compte, **aucun envoi n'a lieu**.
- Une seule photo est envoyée avec `sendFile`; plusieurs photos via **un seul album**, avec la légende sur le premier élément. Les photos et leur légende proviennent de l'annonce Nashra sauvegardée, pas de l'ancien message Telegram d'origine.
- Le transfert (`forward`) conserve le comportement précédent ; la republication texte également.
- Les permissions explicites de destination, validations individuelles, vérifications des dates, délais et règles anti-doublons restent en place. Aucun contournement des restrictions Telegram. Aucun essai automatique après un résultat incertain.

## Installation (dans `C:\Users\matte\nashra-v0.3`)

Télécharger `nashra-v3.7-albums.zip` et l'extraire dans le dossier du projet :

```powershell
Expand-Archive "$HOME\Downloads\nashra-v3.7-albums.zip" -DestinationPath . -Force
node .\install-v37.cjs
node .\verify-v37.cjs
node .\nashra-tests\media-v37.test.cjs
npm run typecheck
```

L'installateur vérifie les empreintes de la V3.6 avant de changer quoi que ce soit et crée des sauvegardes. Si les fichiers ont été modifiés depuis V3.6, il **refuse** le remplacement ; ne pas forcer sans examiner les différences. Il n'altère pas `.env.local`, aucune donnée utilisateur, aucun tarif et aucune migration SQL.

## Vérification sans publication

1. Dans **Mes annonces**, créer une annonce et téléverser 1 ou 2 photos dans Supabase (SQL Storage `003_announcement_images.sql` déjà appliqué).
2. Dans **Campagnes**, sélectionner cette annonce, mode **Republication**, un groupe où vous êtes autorisé à publier et un créneau futur.
3. Ouvrir **Automatisation** ou **Planification** : la campagne ne doit plus être bloquée uniquement en raison des photos hébergées chez Nashra.
4. Préparer la file et vérifier que les opérations ne sont pas envoyées sans activation volontaire.

## Avant un véritable test Telegram

- Vérifier `npm run typecheck`, la session Telegram, la migration 005 et les états RLS/quotas.
- Le serveur de publication doit être réellement déployé et son Cron configuré. Le patch **ne crée pas** de Cron et **n'active pas** de publication.
- Pour un essai réel, sélectionner **un groupe privé de test que vous administrez** et une seule tâche approuvée ; vérifier le contenu et le résultat Telegram avant tout autre essai. Respecter toute restriction de compte/groupe.
- Les tests inclus utilisent des objets simulés : ils ne certifient ni la connectivité Telegram ni le service Supabase réel.

**Limite connue :** un résultat Telegram non confirmé reste `needs_review` sans relance automatique, car il pourrait avoir été publié malgré une interruption réseau. Une photo déjà importée mais supprimée du stockage sera signalée `blocked` sans envoi. La page Bibliothèque autorise toujours les liens HTTPS externes pour l'aperçu seulement.
