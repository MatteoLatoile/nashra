# Nashra V3.2 — Supervision et fiabilité des campagnes

Cette mise à jour ajoute une page **/supervision**, une vue en lecture seule de l'état de la file d'attente, des statistiques d'administration supplémentaires et une réconciliation sûre des tâches interrompues.

## Ce qui change

- Un Cron **déjà configuré** peut, après application du SQL 008, marquer les traitements `processing` abandonnés depuis **15 minutes** comme `needs_review`. **Aucune nouvelle tentative d'envoi n'est effectuée.** Un message a pu partir même si le résultat n'a pas été enregistré : contrôler Telegram manuellement.
- Les opérations approuvées dont le créneau est dépassé de plus de **24 heures** deviennent `blocked`, sans envoi.
- Le Cron reste **protégé par `CRON_SECRET`** ; le worker n'envoie aucun message si `NASHRA_AUTOMATION_ENABLED` et `NASHRA_PUBLISHING_ENABLED` ne sont pas tous les deux égaux à `1`.
- L'insertion de tâches côté utilisateur est limitée à **500 opérations en attente** par compte, programmées entre 1 minute et 90 jours dans le futur.
- Le centre de diagnostic et l'administration exposent les incidents agrégés. Ils ne donnent aucun token, session Telegram ou identifiant de conversation.
- **25 nouvelles clés de traduction** sont fournis dans les 10 langues non françaises, avec une mise en page RTL suivant les règles existantes.

## Installation

**Pré-requis** : V2.0 à V3.1 installées, migrations SQL 001 à 007 déjà exécutées et projet toujours au même endroit.

Dans le dossier Nashra :

```powershell
Expand-Archive "$HOME\Downloads\nashra-v3.2-supervision.zip" -DestinationPath . -Force
node .\install-v32.cjs
node .\verify-v32.cjs
node .\nashra-tests\reliability.test.cjs
npm run typecheck
```

Ensuite ouvrir `supabase/008_queue_reliability.sql` et exécuter **une fois** son contenu dans **Supabase > SQL Editor**, avant de démarrer le Cron.

```powershell
code .\supabase\008_queue_reliability.sql
npm run dev -- --port 3000
```

Naviguer vers `/supervision` puis `/diagnostics`.

## Important

- La migration **n'active pas** la publication et **ne configure aucun Cron**.
- En présence d'un problème Telegram, le traitement reste manuel. Ne contournez pas les restrictions de compte ou de groupe.
- Le programme d'installation ne lit ni ne modifie `.env.local`, ne télécharge rien et effectue un **pré-contrôle complet** avant la moindre modification. Si un fichier diffère de la V3.1 de référence, il s'arrête sans écrasement et affiche les conflits. Sauvegardes sous `nashra-backups/`.
- Les tests vérifient le comportement de classification et la syntaxe des nouvelles pages. Les véritables connexions Telegram, Stripe et Supabase et la compilation complète restent à valider sur votre environnement.
- Aucune landing page, aucun tutoriel interactif n'est inclus ; ces fonctionnalités sont conservées pour la phase finale du projet.
