# Nashra — Publication récurrente + tutoriel 43 étapes

Ce correctif **s’ajoute** au projet Nashra installé avec l’étape 3 des quotas (SQL 015 et 016) et la programmation native Telegram (SQL 013). Le correctif Stripe 4A peut rester installé. **Aucune clé n’est fournie ou modifiée par ce ZIP.**

## Installation PowerShell (sans `cd`)

Copier le ZIP téléchargé dans `Downloads`, puis, depuis le terminal du projet :

```powershell
Expand-Archive "$HOME\Downloads\nashra-recurrence-tutoriel.zip" -DestinationPath . -Force
node .\install-recurring.cjs
node .\verify-recurring.cjs
node --experimental-strip-types --test .\tests\recurrence.test.mjs
npm run typecheck
npm run build
```

**Sauvegardez la base Supabase**, puis exécutez `supabase/018_recurring_rules.sql` dans Supabase SQL Editor, puis `tests/018_readonly_verification.sql` : les 6 booléens `ok` doivent être vrais.

Dans `.env.local`, configurez **sans divulguer de clé** :

```dotenv
NASHRA_RECURRING_ENABLED=1
CRON_SECRET=<une_valeur_aleatoire_de_32_caracteres_ou_plus>
```

Conservez vos variables Supabase de service et Telegram existantes. `NASHRA_DISABLE_ALL_SENDS=1` désactive volontairement les programmations. Redémarrez le serveur après toute modification de `.env.local`.

## Développement et déploiement

Le nouveau `vercel.json` enregistre un Cron quotidien (00h30 UTC), qui appelle `/api/cron/recurring` avec authentification Bearer `CRON_SECRET`. Pour les développements locaux, il n’existe **pas de Cron automatique** : programmez plusieurs jours à l’avance puis lancez manuellement le point de contrôle autorisé ou déployez un cron compatible. Un ordinateur éteint n’affecte pas les occurrences **déjà acceptées par Telegram**, mais les suivantes exigent le Cron. Vercel Hobby ne permet pas l’usage commercial : il ne constitue qu’une option de test personnelle, et sa fréquence quotidienne n’est pas garantie à la minute.

La règle peut répéter tous les 1 à 30 jours, à heure locale fixe et dans le fuseau horaire choisi. Jusqu’à 10 groupes sont autorisés **par règle**, dans l’ordre sélectionné. Les envois natifs sont espacés de **90 secondes par groupe** : à 10h, 10h01m30s, 10h03, etc. Le compte est soumis aux restrictions de Telegram et aux quotas de son forfait. Les 100 groupes Business sont une limite totale de groupes actifs, **pas** une garantie de 100 groupes dans une seule règle. Pour la sécurité, maximum 30 programmations récurrentes par jour et par compte dans cette version.

Chaque groupe × occurrence consomme une réservation de publication, sous contrôle SQL atomique. Un message **programmé** n’est **pas** marqué « envoyé » sans preuve de livraison. À l’échéance, l’historique signale « à vérifier » si la livraison n’a pas été confirmée. Aucun renvoi automatique en cas d’échec ou de réponse Telegram incertaine. Une pause arrête les nouvelles occurrences et tente d’annuler celles encore présentes chez Telegram ; une annulation échouée est signalée explicitement.

## Test réel recommandé

Sur un groupe **privé que vous administrez** et où vous avez le droit de publier : créez une annonce, choisissez 2 groupes autorisés, « Répéter automatiquement », tous les 2 jours et un départ au moins 10 minutes après l’heure actuelle. Vérifiez dans Telegram les messages programmés avec 90 secondes d’écart, puis la deuxième occurrence. Fermez Nashra pour vérifier les premières occurrences ; vérifiez le Cron quotidien pour la poursuite à long terme. Mettez ensuite en pause et contrôlez que les messages futurs sont supprimés chez Telegram. Ne publiez pas dans des groupes où ce type d’envoi est interdit.

## Tutoriel

La visite de bienvenue passe de 40 à 43 étapes et explique : publication unique ou récurrente, intervalle/fuseau/date de fin, et envois espacés entre groupes. Les textes existent dans les 11 langues. La clé de suivi V3 affiche **une seule fois** le tutoriel actualisé, puis permet de le revoir via l’avatar. La visite n’envoie aucun message et ne valide aucun formulaire.

## Validation honnête

Les tests de calcul temporel et les contrôles de syntaxe ont été réalisés hors ligne. Le vrai build Next.js, les migrations dans votre Supabase, le Cron déployé et les messages Telegram n’ont **pas** pu être exécutés depuis cet environnement. Ne commercialisez pas les récurrences avant ces validations.
