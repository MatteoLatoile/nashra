# Nashra — Correctif de finition (parcours essentiel)

Ce correctif est construit **uniquement** pour l'archive `nashra-final.zip` envoyée le 27 octobre 2026. Il ne crée pas de nouveaux tableaux de bord et préserve Profil, avatar, Paramètres, authentification, 11 langues, annonces, photos et toutes les données existantes.

## Ce qui change

- Navigation allégée : Accueil, Annonces, Telegram, Destinations, Calendrier, Historique. Les anciennes pages techniques continuent d'exister, mais ne sont plus affichées dans le menu.
- Depuis une annonce, bouton **Publier** : sélection explicite d'un groupe autorisé (un groupe par confirmation), envoi via le compte Telegram personnel. Reprend exactement la préparation du contenu du worker pour le texte et les photos. Confirmation et résultat enregistrés dans `delivery_queue` pour l'historique.
- Sécurité d'envoi manuel : migration SQL `012_manual_claim.sql`, qui verrouille la revendication des envois (même verrou que le Cron), interdit les doublons de requête et applique les pauses de sécurité de Nashra. Une tentative non confirmée **n'est jamais renvoyée automatiquement**.
- **Calendrier** : création simplifiée d'une programmation (une annonce + groupes autorisés + date/heure). Le serveur vérifie le brouillon, le quota et la source Supabase avant d'enregistrer les tâches `approved`. Mise en pause, reprise et suppression annulent ou recréent les tâches non envoyées.
- **Historique** : affiche les résultats des vrais envois manuels et programmés, pas le journal générique des modifications. Export CSV.
- Correction de la limite Telegram : 4 096 caractères pour le texte seul, 1 024 caractères avec photos.

## Installation (dans `C:\Users\matte\nashra-v0.3`)

1. **Sauvegarder le projet**, fermer l'onglet Nashra et arrêter le serveur (`Ctrl+C`).
2. Extraire le ZIP **dans le dossier Nashra**. Les fichiers du correctif sont sous `nashra-finish-payload/` et n'écrasent rien avant l'installation.
3. `node .\install-finish.cjs`
4. Dans Supabase > SQL Editor, exécuter **`supabase/012_manual_claim.sql`**. Les migrations 004 à 011 doivent être déjà installées.
5. `npm run typecheck` puis `npm run build`.
6. `npm run dev -- --port 3000`.

L'installateur contrôle l'empreinte SHA-256 des fichiers existants. Si un fichier a changé depuis l'archive, **il s'arrête avant toute modification**. Il crée une sauvegarde complète des fichiers remplacés sous `nashra-backups/`.

## Tests essentiels (compte Telegram et groupe privé dont vous êtes administrateur)

- Créer une annonce texte, sélectionner **Publier**, confirmer pour un seul groupe. Vérifier le message sur Telegram **et** la ligne dans Historique.
- Attendre le délai de sécurité défini (10 min par compte, 60 min vers le même groupe). Tester une annonce avec une photo, puis un album de deux photos.
- Programmer une annonce au moins 3 minutes dans le futur depuis Calendrier ; vérifier que les tâches sont en statut `approved` et que l'historique est à jour. Tester Pause et Reprise avant l'heure prévue.
- Tester les données existantes : anciennes annonces, profil, langues, connexion Telegram, photos.
- Vérifier qu'une photo externe non hébergée chez Nashra est refusée **avant** tout envoi.

## Limites importantes

- **La programmation automatique sans PC allumé exige toujours un worker/Cron réellement hébergé.** Ce patch ne fournit pas d'hébergement gratuit permanent. Le statut « moteur déclaré actif » ne démontre pas qu'un Cron tourne ; il faut tester l'envoi réel après extinction de l'ordinateur.
- L'envoi manuel nécessite `SUPABASE_SERVICE_ROLE_KEY` **côté serveur uniquement**, `NASHRA_PUBLISHING_ENABLED=1` et une session Telegram personnelle valide. Ne l'activez pas tant que votre compte est restreint ou que les droits du groupe ne sont pas confirmés.
- Les programmations exigent Supabase et les migrations déjà appliquées ; une seule annonce par nouvelle programmation pour garder l'interface claire. Les campagnes historiques restent visibles, mais leur contenu n'est pas automatiquement modifié.
- Les groupes doivent avoir un identifiant Telegram **numérique** connu de votre compte et une autorisation déclarée. Les `@username` ne sont pas utilisés pour programmer.
- Pour des raisons de sécurité, aucune action automatique n'est relancée en cas d'échec ou de résultat incertain.
- L'heure exacte peut être décalée lorsque plusieurs destinations sont programmées au même moment, à cause des délais de sécurité intégrés à Nashra.
- La compilation complète et les appels vers votre vrai Supabase/Telegram ne sont pas vérifiables ici ; ils doivent être testés sur votre PC avec vos dépendances installées.

**Surtout :** ce n'est ni un nouveau SaaS ni une nouvelle version marketing. C'est un correctif ciblé des fonctions essentielles. Les outils d'administration et les données d'origine sont conservés, et le site commercial ainsi que le tutoriel du dashboard restent pour la toute fin.
