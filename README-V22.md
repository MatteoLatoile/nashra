# Nashra V2.2 — Prévisualisation du plan d'exécution

Cette étape introduit un aperçu détaillé des opérations potentielles avant de créer une file d'attente persistante.

- Nouvelle page `/planification` (accessible directement par URL).
- API `GET /api/automation/plan` réservée à l'utilisateur connecté ; workspace filtré par user_id.
- Calcul déterministe des combinaisons créneau × annonce × destination uniquement pour les campagnes passant l'audit V2.1.
- Export CSV de l'aperçu (250 lignes maximum), avec protection contre l'injection de formules.
- Signalement des dates dépassées et des campagnes bloquées.
- **Pas d'envoi Telegram, pas de cron, pas de SQL, pas de modification de données.**
- L'aperçu ne garantit pas les permissions réelles des groupes.

## Installation

Décompressez ce ZIP **dans le dossier racine Nashra déjà mis à jour en V2.1**, puis lancez :

```powershell
node .\install-v22.cjs
npm run typecheck
npm run dev -- --port 3000
```

Ouvrez `http://localhost:3000/planification`.

Le script est idempotent et sauvegarde automatiquement les fichiers remplacés. Aucun changement `.env.local` ni SQL.
