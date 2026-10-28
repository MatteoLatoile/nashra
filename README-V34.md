# Nashra V3.4 — Console d'administration premium

**Compatibilité :** projet Nashra ayant installé V2.7 (administration) et V3.3 (quotas). SQL 004 → 009 déjà appliqué. Ce patch ne publie rien sur Telegram et ne crée pas de paiements.

## Fonctions livrées

- Vue générale : nombre de comptes, connexions Telegram, abonnements actifs/essai, file d'attente, tendance des tâches sur 7 jours UTC, état des services.
- Utilisateurs : comptes issus de Supabase Auth (25/page), e-mail, date de création, dernière connexion, forfait, abonnement et nombre de tâches actives. Recherche locale **sur la page courante**.
- Abonnements : lecture seule des contrats Stripe TEST, statut, prix, échéance, annulation programmée (30/page).
- Incidents : consultation des opérations bloquées, à examiner ou en cours; ajout d'une note interne, classement ouvert / en examen / résolu sans jamais renvoyer de message Telegram.
- Audit : chaque mise à jour de dossier est conservée dans un journal d'administration.
- CSV : export des 200 premiers comptes, abonnements ou incidents récents, avec neutralisation des formules Excel.
- Sécurité : vérification de la session ET liste blanche des UUID administrateurs côté serveur avant utilisation du rôle service Supabase; aucun jeton personnel Telegram ni secret Stripe dans les réponses. RLS sans politiques utilisateur sur les tables admin. Écritures via RPC SQL transactionnelle contrôlant le rôle de service.
- Compilation : les anciens dossiers de sauvegarde Nashra sont exclus du `tsconfig.json` pour éviter de traiter des snapshots comme du code actif.

## Installer le correctif

1. Sauvegarder son projet; fermer `npm run dev` avec `Ctrl + C`.
2. Dézipper **tout** le correctif à la racine du projet :

```powershell
Expand-Archive "$HOME\Downloads\nashra-v3.4-admin.zip" -DestinationPath . -Force
node .\install-v34.cjs
node .\verify-v34.cjs
node .\nashra-tests\admin-v34.test.cjs
npm run typecheck
```

Le script est répétable, enregistre les fichiers qu'il remplace dans `nashra-backups/v34-...`, et n'écrase pas une page admin inconnue ou les nouveaux fichiers déjà modifiés. **Il n'efface pas les données utilisateurs**. Aucune nouvelle dépendance NPM.

3. Ouvrir **Supabase → SQL Editor** et exécuter exactement le fichier `supabase/010_admin_console.sql`. Les migrations `004` à `009` doivent déjà fonctionner. La migration 010 est répétable.
4. Dans le fichier `.env.local` du SERVEUR uniquement (ne pas coller ses valeurs dans la conversation), vérifier :

```ini
# UUID Supabase Auth des administrateurs, séparés par des virgules
NASHRA_ADMIN_USER_IDS=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
# Clé du rôle serveur Supabase, NE JAMAIS préfixer par NEXT_PUBLIC_
SUPABASE_SERVICE_ROLE_KEY=VOTRE_CLE_SECRETE_SERVEUR
```

Le script ne modifie pas `.env.local`. Les UUID figurent dans **Supabase → Authentication → Users**. Ne pas utiliser un e-mail à la place de l'UUID. Le service_role ne doit JAMAIS être partagé ni envoyé vers le navigateur.

5. `npm run dev -- --port 3000` puis ouvrir `http://localhost:3000/admin` en étant connecté avec l'UUID administrateur. Tester avec un deuxième compte non autorisé : l'API `/api/admin/v34` doit répondre `403` et ne divulguer aucune donnée.

## Validation recommandée

- Vérifier les cinq onglets de `/admin`, la pagination, l'export CSV.
- Faire une note interne sur une opération de test **déjà bloquée ou à examiner**, puis confirmer sa présence dans le Journal d'audit.
- Contrôler dans Supabase que les tables `nashra_admin_cases` et `nashra_admin_audit` sont présentes.
- Vérifier que l'état réel d'une opération Telegram **ne change pas** après avoir classé un dossier.
- Vérifier que `GET /api/admin/v34` renvoie `401` déconnecté et `403` avec un utilisateur ordinaire.

## Limitations intentionnelles

- Les droits administrateurs sont gérés par variable serveur, pas depuis l'interface utilisateur.
- Les abonnements restent en mode test et les statuts proviennent des webhooks Stripe vérifiés; la console **ne permet pas** de s'attribuer un forfait ni de forcer un paiement.
- Le classement d'un dossier est documentaire : une opération `needs_review` reste `needs_review`, pas de relance automatisée.
- Les utilisateurs peuvent être consultés, mais pas encore suspendus, supprimés ou invités depuis cette version. L'export est limité à 200 enregistrements. Recherche e-mail : page actuelle uniquement.
- La nouvelle console est rédigée en français; les écrans préexistants et leurs onze langues ne sont pas modifiés. Traduction de la nouvelle console : travail restant.
- Le worker/Telegram, le SQL réel et les événements Stripe ne peuvent pas être validés depuis l'archive; lancer les tests en environnement de développement avant production.
- Le site commercial et le tutoriel interactif du dashboard **restent en dernier**, conformément au plan.

## Retrait / restauration

Les modifications de la page `src/app/(dashboard)/admin/page.tsx`, de `src/app/globals.css` et de `tsconfig.json` sont sauvegardées sous `nashra-backups/v34-*`. Restaurer depuis le dossier de sauvegarde choisi, retirer les nouvelles routes `/api/admin/v34`, la lib `nashra-admin` et le SQL 010 uniquement selon une migration de retour préparée (ne jamais supprimer des tables avec des données sans sauvegarde).
