# Nashra V2.1 — Audit des campagnes (lecture seule)

**Cette mise à jour ne publie aucun message.** Elle prépare la future automatisation en identifiant les erreurs avant exécution. Le moteur d'exécution côté serveur, sa file d'attente, la gestion des doublons et les garanties contre les envois non consentis restent à développer.

## Installation

1. Installer et vérifier Nashra V2.0 au préalable.
2. Extraire ce ZIP à la racine du projet puis exécuter : `node .\install-v21.cjs`.
3. Lancer `npm run typecheck` et ensuite `npm run dev -- --port 3000`.
4. Ouvrir `/campagnes`, puis « Vérifier la préparation des campagnes » ou ouvrir directement `/automatisation`.

L'installation est **tout ou rien** : elle refuse les fichiers V2.0 modifiés et ne les écrase pas. Les fichiers remplacés sont sauvegardés dans `nashra-backups`. Aucun changement SQL, `.env.local`, compte Telegram ou données Supabase.

## Vérifications

- Session Nashra requise pour consulter son audit cloud ; l'API ne renvoie que les campagnes de cet utilisateur.
- Vérifie le statut, les dates, les annonces sources et les destinations marquées autorisées.
- Ne consulte **pas** Telegram : droits de publication réels, sessions et limitations ne peuvent pas être confirmés par cet audit.
- Les dates passées ne sont **pas** envoyées automatiquement.
- L'écran fonctionne aussi avec les données locales de démonstration.

## Prochaine étape

Après validation, implémenter une file transactionnelle côté serveur, le consentement explicite, l'idempotence, l'exécution avec cadence limitée, les journaux et une désactivation d'urgence, puis des tests réels sur un groupe dont vous avez l'autorisation.
