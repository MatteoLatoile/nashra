# Nashra — Un seul circuit de publication (correctif de fiabilité)

**Base nécessaire :** le projet `nashra-final.zip` avec le correctif `nashra-essentiel-final.zip` déjà installé.

Ce correctif **ne crée aucune fonctionnalité** et n'ajoute ni page, ni migration SQL, ni service externe. Il retire une duplication risquée découverte lors de la vérification des routes :

- `POST /api/telegram/user/publish` publiait directement, sans enregistrer l'opération dans `delivery_queue` et sans appliquer les mêmes délais que les envois du calendrier.
- Cette ancienne route retourne désormais **HTTP 410**, sans contacter Telegram.
- La page Telegram conserve **connexion du compte, importation des messages/photos et enregistrement des groupes autorisés**, mais renvoie à **Mes annonces** pour tout envoi. Le bouton de publication en double et son sélecteur de mode disparaissent.
- La rubrique Destinations indique clairement qu'il faut un **identifiant numérique** (`-100...`) pour publier/programmer, et non un lien `t.me` ou un `@username`.
- Profil, avatar, bibliothèque, calendrier, historique, langues et comptes sont conservés.

## Installation dans le dossier Nashra (PowerShell)

Arrêtez le serveur Next.js, puis extrayez `nashra-correctif-publication-unique.zip` dans votre projet et exécutez :

```powershell
node .\install-core.cjs
node .\verify-core.cjs
npm run typecheck
```

Si la compilation réussit, `npm run dev -- --port 3000`.

L'installateur compare les empreintes SHA-256, refuse tout fichier modifié depuis la base fournie, crée des sauvegardes sous `nashra-backups/` et peut être exécuté deux fois. **Ne forcez jamais un conflit.**

## Vérification réelle (groupe Telegram privé contrôlé)

1. Dans Telegram, connectez votre compte et chargez vos conversations.
2. Si nécessaire, choisissez un message et importez-le ; ou créez une nouvelle annonce dans Mes annonces.
3. Enregistrez un groupe dont vous contrôlez les droits, avec son identifiant numérique, puis vérifiez la synchronisation Supabase.
4. Après installation du SQL 012 du correctif précédent et configuration sécurisée du serveur, testez **Publier maintenant** dans ce seul groupe, puis consultez Historique.
5. Testez une programmation dans Calendrier et la présence de la tâche approuvée. Pour démontrer un envoi **PC éteint**, un Cron réellement hébergé reste indispensable.

Ce correctif ne prouve pas que le moteur fonctionne 24h/24, ne configure aucun hébergement, et n'active aucune publication. Il n'y a **aucune raison de payer un abonnement** à ce stade.

## Remarque sécurité

Les jetons secrets Telegram précédemment publiés dans le chat doivent être considérés comme compromis. Renouvelez le jeton BotFather exposé ; ne placez jamais une clé `service_role` ou une session Telegram dans les fichiers du navigateur ou sur un dépôt public.
