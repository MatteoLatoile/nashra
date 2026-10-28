# Nashra V2.3 — File persistante, sans publication

Cette mise à jour est une étape volontairement sécurisée vers un moteur serveur : elle enregistre un planning *futur* dans Supabase et permet de l'annuler. **Aucune tâche n'est exécutée et aucun message Telegram n'est envoyé.**

## Installation
1. V2.2 doit être installée.
2. Décompresser à la racine du projet, puis `node .\install-v23.cjs`.
3. Exécuter le fichier `supabase/004_delivery_queue.sql` dans Supabase SQL Editor.
4. `npm run typecheck`, puis `npm run dev -- --port 3000`.
5. Ouvrir `/file-attente`.

L'installation sauvegarde le CSS existant et n'écrase aucun fichier différent. Elle ne touche pas aux sessions Telegram, aux campagnes existantes, ni aux variables d'environnement.

## Limites et sécurité
- Seules les opérations à venir (plus d'une minute) provenant des campagnes prêtes V2.1 sont préparées.
- 100 opérations maximum par préparation ; aucune troncature silencieuse.
- Chaque opération possède une clé unique par utilisateur ; les tâches annulées ne sont pas réactivées silencieusement.
- Les politiques RLS Supabase isolent les utilisateurs ; l'API impose la session et vérifie l'origine des POST.
- Les autorisations Telegram sont déclaratives ; le moteur d'exécution ultérieur devra revérifier les permissions effectives, limiter les fréquences, gérer FLOOD_WAIT et ne jamais contourner les restrictions.
- La vérification `npm run typecheck` et les tests d'intégration Supabase restent à faire sur la machine de l'utilisateur.
