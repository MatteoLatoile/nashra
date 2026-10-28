# Nashra V3.1 — Stabilisation, sécurité et diagnostic

**Conçu à partir de la base Nashra V2.0 → V2.7 et i18n V3 partagée précédemment.**
Cette mise à jour n'installe pas de landing page ni de tutoriel interactif.

## Contenu du ZIP

- `src/app/(dashboard)/diagnostics/page.tsx` : diagnostic lisible avec états, navigation et responsive.
- `src/app/api/diagnostics/route.ts` : diagnostic authentifié et lecture seule ; ne renvoie ni clés, ni sessions, ni contenu de messages ; ne contacte pas Telegram ni Stripe.
- `supabase/007_queue_guards.sql` : verrouille les transitions de statut autorisées par les clients Supabase connectés. Seul un job `held` peut être approuvé, et seulement plus d'une minute avant sa date. Annulation possible depuis `held`/`approved`. La mise à jour serveur en `processing`/`sent` demeure possible via le rôle serveur.
- 23 libellés de ce nouveau module dans les 11 langues ; les détails techniques renvoyés par le serveur restent en français.
- Amélioration du GET de la file : indique si les deux flags de publication sont activés au lieu d'afficher constamment `false`.
- Vérification de l'installation + tests d'invariants statiques hors ligne.

## Installation dans le dossier existant Nashra

**1.** Faites une sauvegarde de votre projet et arrêtez le serveur Next.js.

**2.** Extrayez le ZIP **dans** le dossier du projet (`C:\Users\matte\nashra-v0.3` dans l'historique). Exécutez :

```powershell
Expand-Archive "$HOME\Downloads\nashra-v3.1-fiabilite.zip" -DestinationPath . -Force
node .\install-v31.cjs
node .\verify-v31.cjs
node .\nashra-tests\security.test.cjs
npm run typecheck
```

Si `install-v31.cjs` signale un conflit, **arrêtez** : il ne remplacera pas un fichier nouveau déjà personnalisé. Les fichiers existants modifiés sont sauvegardés dans `nashra-backups/v31-...`.

**3.** Ouvrez `supabase/007_queue_guards.sql`, copiez son contenu dans **Supabase → SQL Editor**, et exécutez-le **après** les migrations 004 et 005. Cette étape n'est pas automatique.

```powershell
code .\supabase\007_queue_guards.sql
```

**4.** Démarrez :

```powershell
npm run dev -- --port 3000
```

Ouvrez **http://localhost:3000/diagnostics**. La page est également ajoutée au menu.

## Tests manuels conseillés

- Ouvrez `/diagnostics` en étant connecté : vous devez voir les contrôles de votre espace.
- En étant déconnecté, `/api/diagnostics` doit répondre HTTP **401**.
- Après SQL 007, le bloc **Sécurité de la file** doit devenir vert au prochain rafraîchissement.
- Vérifiez que « publication automatique désactivée » apparaît lorsque les deux flags ne sont pas activés.
- Testez les mises en page arabe (RTL) et anglaise.
- Ouvrez `/operations` et `/file-attente` ; vos données existantes doivent être conservées.

## Ce que le diagnostic ne peut pas prouver

- La présence des secrets serveur n'implique pas qu'un Cron fonctionne en production.
- La présence d'une session Telegram chiffrée n'implique pas qu'elle soit encore valide.
- Le bucket Supabase Storage n'est **pas** testé par une écriture, volontairement.
- Cette version ne teste ni n'active les paiements ou les publications réelles.
- Une compilation locale et des tests d'intégration sur le projet déployé restent nécessaires.

## Sécurité

Le diagnostic requiert une session authentifiée. Il ne fournit pas de secrets aux clients. Les contrôles de file sont limités aux 500 tâches visibles par le propriétaire via RLS. La migration SQL améliore les transitions authentifiées mais ne remplace pas les tests RLS/permissions en environnement réel.

Les groupes Telegram utilisés doivent explicitement autoriser les publications. Nashra ne doit pas contourner les restrictions de Telegram ni republier automatiquement les échecs incertains.
