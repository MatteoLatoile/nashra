# Nashra V3.5 — Supervision réelle, journal du worker et diagnostic de production

Cette version améliore la **fiabilité observable** de Nashra, sans modifier les règles d'envoi Telegram, sans lancer de campagne et sans encaisser de paiement.

## Fonctionnalités

- **Instrumentation Cron** : toute invocation autorisée de `/api/cron/nashra` ajoute un enregistrement minimal (heure, durée, issue, nombre de tâches réconciliées). Aucun identifiant de compte, message, groupe ou session Telegram n'est stocké dans ce journal.
- **Nouvelle page `/surveillance-systeme`** : tableau de bord réservé aux administrateurs, 10 contrôles de configuration et de schéma, dernière invocation Cron, distribution des résultats, statistiques de file d'attente et historique des exécutions.
- **Contrôles de migrations** : détecte l'absence de `attempted_at` (SQL 005), de quotas (SQL 009), des dossiers admin (SQL 010), du journal (SQL 011) et des fonctions de protection (SQL 007–008).
- **Export CSV sécurisé** : 500 exécutions maximum sur 6h, 24h, 72h ou 7 jours, valeurs CSV neutralisées contre les formules.
- **Navigation** : lien vers la nouvelle supervision sur la page `/admin`.
- **Sauvegardes et tests** : script idempotent, contrôle des prérequis, vérification statique, 10 tests de règles de sécurité.

**Limites :** Ce module ne crée pas le Cron externe. Des exécutions ne sont visibles qu'après un appel réel et autorisé du Cron ET l'application de SQL 011. Une exécution « sent » indique que le worker a reçu une confirmation Telegram, mais ne prouve pas la lecture du message par les destinataires. Un Cron muet peut indiquer un Cron inexistant, un jeton incorrect ou un arrêt du serveur : cette page ne distingue pas automatiquement toutes ces causes. Aucune relance automatique d'envoi uncertain.

## Installation (pré-requis V3.4 et route Cron V3.2)

Télécharger le ZIP, arrêter `npm run dev` avec `Ctrl + C`, puis depuis la racine `C:\Users\matte\nashra-v0.3` :

```powershell
Expand-Archive "$HOME\Downloads\nashra-v3.5-supervision.zip" -DestinationPath . -Force
node .\install-v35.cjs
node .\verify-v35.cjs
node .\nashra-tests\monitor-v35.test.cjs
npm run typecheck
```

Le programme **ne modifie pas** `.env.local`. Il sauvegarde les fichiers modifiés dans `nashra-backups/v35-*`. Il refuse de remplacer un fichier inconnu et ne touche ni aux campagnes ni aux annonces. Si le contrôle échoue, ne lancer pas les migrations au hasard : vérifier que V3.2 et V3.4 ont été installées. Le correctif suppose le contenu d'origine de la route Cron V3.2 ; s'il a été personnalisé il ne l'écrase pas.

### Supabase

**Après la réussite de l'installation**, ouvrir `supabase/011_worker_monitor.sql` et l'exécuter dans **Supabase → SQL Editor**. Ce fichier exige que les migrations précédentes soient déjà en place. Il est conçu pour être répétable. La table `nashra_worker_runs` est privée (RLS activée et aucun accès client). Le rôle service seul peut ajouter et consulter les enregistrements. Une fonction `nashra_v35_prune_worker_runs(45)` permet de purger manuellement les entrées de plus de 45 jours via un appel serveur autorisé; aucune suppression n'est exécutée par l'installation.

### Ouvrir l'interface

```powershell
npm run dev -- --port 3000
```

- `http://localhost:3000/admin` — lien « Santé du système ».
- `http://localhost:3000/surveillance-systeme` — diagnostic complet.

La page exige une session authentifiée **et** un UUID présent dans `NASHRA_ADMIN_USER_IDS`. Un autre utilisateur doit obtenir une réponse `403` à `/api/admin/v35`. Ne pas envoyer sa clé `SUPABASE_SERVICE_ROLE_KEY`, token Telegram, API hash ou clé de chiffrement dans la conversation.

## Tests à effectuer

1. `npm run typecheck` et redémarrage sans erreurs (la vérification de syntaxe ne vaut pas test d'intégration).
2. Avant SQL 011 : la page admin affiche une erreur pour le journal, sans exposer de secrets.
3. Après SQL 011 et appel **autorisé** au Cron : la dernière exécution apparaît. Sans Cron configuré, pas d'entrées.
4. Aucun utilisateur ordinaire ne peut consulter `/api/admin/v35` et `/api/admin/v35/export`.
5. Déconnecté : les deux endpoints répondent `401`.
6. Le Cron protégé renvoie `401` sans token valide; ne pas l'appeler sans raison lorsqu'une publication est activée.
7. Les publications et paiements restent **désactivés**, sauf si déjà activés volontairement côté serveur.

### En cas d'erreur « attempted_at does not exist »

Ne pas ajouter une colonne à la main : vérifier et exécuter **005** après **004**, puis **007**, **008**, **009**, **010** et enfin **011** en respectant les dépendances. Ne pas exécuter un vieux SQL à l'aveugle s'il modifie des fonctions déjà déployées; en cas de conflit, examiner le schéma réel.

## Notes techniques

- L'appel de télémétrie est **best effort** : une défaillance d'enregistrement n'a aucun effet sur le résultat Telegram et ne provoque aucun retry.
- Le statut `needs_review` ou `error` est un incident nécessitant une vérification humaine; jamais de renvoi automatique.
- La page et les textes nouveaux sont pour l'instant en **français**; l'application conserve le catalogue existant de 11 langues mais ce nouvel écran n'a pas encore toutes les traductions.
- Aucun site commercial ni tutoriel interactif de première visite n'est ajouté : ces modules restent volontairement à la fin du projet.
