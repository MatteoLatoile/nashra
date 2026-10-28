# Nashra V3.8 — Mise en route sécurisée de la programmation réelle

**Priorité unique : terminer la configuration du worker existant.** Aucun écran, aucune migration SQL, aucun forfait et aucune fonctionnalité décorative.

## Concrètement

- La route `GET /api/cron/nashra` garde le même mécanisme de contrôle `Authorization: Bearer <CRON_SECRET>` avec comparaison à temps constant.
- Un appel authentifié à `GET /api/cron/nashra?dry_run=1` répond avec l'état des 2 interrupteurs **sans aucune réclamation de tâche, connexion Telegram ni accès à la file**. C'est un test de sécurité et de configuration, **pas un test réel d'envoi**.
- Si l'un des deux interrupteurs vaut `0`, l'appel régulier du Cron indique `disabled` et n'exécute ni rapprochement de file ni publication. Une télémétrie « disabled » est tentée si SQL 011 est installé.
- Une configuration Vercel Pro explicite peut créer `vercel.json` et appeler `/api/cron/nashra` toutes les 10 minutes. **L'installation n'active pas le Cron** : vous devez choisir l'hébergeur, configurer ses secrets et déployer vous-même.
- Des tests locaux simulent les requêtes au Cron ; ils n'utilisent ni Supabase ni Telegram.

## Installer dans le dossier existant Nashra

```powershell
Expand-Archive "$HOME\Downloads\nashra-v3.8-automation.zip" -DestinationPath . -Force
node .\install-v38.cjs
node .\nashra-tests\cron-v38.test.cjs
node .\nashra-tests\media-v37.test.cjs
npm run typecheck
node .\preflight-v38.cjs
```

Le script d'installation refuse les versions inattendues et sauvegarde `route.ts`. Il ne modifie pas `.env.local`, vos données Supabase ou vos fichiers Telegram. Si un contrôle échoue, ne pas forcer un remplacement.

## Mode production : Vercel Pro ou serveur externe

### Vercel Pro

Vercel **Hobby** ne permet pas les Cron toutes les 10 minutes. Pour Pro :

```powershell
node .\configure-cron-v38.cjs --vercel-pro
```

Le script fusionne un `vercel.json` existant, sauvegarde avant écriture et refuse un Cron Nashra concurrent. Il ne déploie rien. Avant déploiement configurer sur Vercel (côté serveur uniquement) :

- `CRON_SECRET`: secret aléatoire de >= 32 caractères, ne jamais partager ni préfixer `NEXT_PUBLIC_`.
- `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` : votre projet Supabase.
- `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `NASHRA_SESSION_ENCRYPTION_KEY` : identifiants/session de l'intégration compte personnel.
- Commencer par `NASHRA_AUTOMATION_ENABLED=0`, `NASHRA_PUBLISHING_ENABLED=0`.

Il faut aussi que les migrations **004, 005, 007, 008, 009, 010, 011** pertinentes aient été appliquées dans Supabase et que la table des sessions Telegram soit accessible. **Le script local vérifie seulement la présence des fichiers SQL, pas le schéma distant.**

Vercel déclenche les Cron uniquement sur les déploiements production. Pour Vercel, la valeur de `CRON_SECRET` configurée sur l'hébergement est transmise automatiquement dans l'en-tête `Authorization`.

### Un autre hébergement Node.js

Si vous n'utilisez pas Vercel Pro, programmez un **appel HTTP GET toutes les 10 minutes** à l'URL déployée `/api/cron/nashra`, avec en-tête `Authorization: Bearer <CRON_SECRET>`. Un cron externe sécurisé ou un serveur Node.js toujours disponible fonctionne ; un navigateur local ou un ordinateur éteint ne fait pas tourner `npm run dev`.

Ne mettez pas de secret dans l'URL, dans Git, ni dans le navigateur.

## Séquence de validation avant envoi

1. `npm run typecheck`, `npm run build`, et tests de simulation `cron-v38` + `media-v37`.
2. Laissez les deux interrupteurs à `0`. Déployez en **production** puis vérifiez dans `/surveillance-systeme` qu'un battement `disabled` arrive. Si rien n'arrive, le Cron / serveur n'est pas configuré ou SQL 011 manque.
3. Depuis votre PC, avec **le même `CRON_SECRET`** dans `.env.local`, lancez le contrôle HTTPS sécurisé :

   ```powershell
   node .\check-deployed-cron-v38.cjs https://votre-domaine-de-deploiement.example/
   ```

   Le script teste une requête **sans jeton** (attendu `401`) et une requête **autorisée** sur `?dry_run=1` (attendu `dry_run`), sans publication ni réclamation de tâche. Le serveur ne fournit jamais le secret dans la réponse.
4. Préparez **une seule tâche** future pour un **groupe privé de test que vous administrez** et approuvez cette tâche explicitement. N'utilisez pas des groupes publics de promotion pour un premier test.
5. Activez `NASHRA_AUTOMATION_ENABLED=1` et `NASHRA_PUBLISHING_ENABLED=1` **uniquement sur le serveur**, après vérification. Le prochain Cron peut alors déclencher l'envoi approuvé (et d'autres tâches approuvées existantes !) : assurez-vous qu'il n'en reste pas. Un seul job au maximum par invocation. **Ne lancez pas manuellement la route normale comme si c'était un diagnostic.**
6. Confirmez dans Telegram, `/file-attente` et `/historique` le résultat de ce test. Remettez les interrupteurs à `0` jusqu'à validation. Les erreurs incertaines restent en `needs_review` — aucune relance automatique.

## Limites

- **Aucun hébergement ni compte Vercel n'est créé par ce ZIP**. La mise à jour prépare le déclenchement réel mais ne constitue pas un déploiement. Sans serveur déployé, le navigateur fermé ne suffit pas.
- L'exactitude à la minute n'est pas garantie : la tâche est traitée au passage du Cron. Une invocation ne traite au maximum qu'une tâche. Un volume supérieur nécessitera un dimensionnement du worker.
- **Tests locaux = simulations**. La publication réelle par Telegram et Supabase dépend de vos identifiants, droits de groupe, conditions réseau et déploiement. Ne publiez pas dans un groupe sans permission et n'essayez pas de contourner une restriction Telegram.
- Si votre ancienne clé de chiffrement des sessions a été divulguée, procédez à une rotation avec migration ou reconnexion adaptée. Changer cette clé brutalement rend les sessions enregistrées illisibles.
