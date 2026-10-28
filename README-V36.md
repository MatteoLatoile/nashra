# Nashra V3.6 — correction du cœur de publication

**Cette mise à jour ne crée aucune page, aucun menu, aucune table et aucune migration SQL.**

## Le vrai problème corrigé

Jusqu'ici, le contrôle de préparation exigeait un message Telegram source pour **toutes** les campagnes, y compris une annonce texte créée directement dans Nashra. Même une annonce valide ne pouvait donc pas rejoindre la file d'attente. Avec V3.6 :

- **Republication (`repost`) d'une annonce texte** : un brouillon Nashra sans message Telegram source est maintenant accepté (1–4 096 caractères). Le worker l'envoie avec le compte personnel Telegram connecté lorsque toutes les conditions de publication sont remplies.
- **Transfert (`forward`)** : nécessite toujours un message Telegram source vérifiable.
- **Republication avec des photos** : si un message source Telegram est présent, le comportement historique est conservé. Si les images existent uniquement comme liens/fiche Nashra sans source Telegram, la campagne est bloquée plutôt que d'envoyer un texte incomplet.
- **Sécurité conservée** : accord explicite par opération, destinations déclarées autorisées, délais d'espacement, pas de relance automatique, drapeaux d'activation du worker désactivés par défaut.

**Limite** : une republication de média utilisant une source Telegram utilise le message d'origine, pas nécessairement les images ou légendes modifiées dans l'éditeur Nashra. L'envoi automatique des images chargées dans Supabase reste à développer et à tester.

## Installation (dans le dossier actuel de Nashra)

1. Extraire `nashra-v3.6-publications-core.zip` à la racine du projet.
2. `node .\install-v36.cjs`
3. `node .\verify-v36.cjs`
4. `node .\nashra-tests\core-v36.test.cjs`
5. `npm run typecheck`
6. Redémarrer : `npm run dev -- --port 3000`

L'installateur crée une sauvegarde horodatée des deux fichiers. Il refuse toute version inattendue pour éviter d'écraser vos modifications et n'écrit rien si les prérequis ne correspondent pas. Si l'un des fichiers est déjà la version V3.6, il le laisse intact.

## Test fonctionnel sans envoi

1. Créer une annonce avec du texte **sans photo ni source Telegram**.
2. Créer une campagne **Republication**, choisir une destination où vous avez l'autorisation et un créneau futur.
3. Vérifier qu'elle est désormais **prête** dans Automatisation/Planification.
4. Préparer la tâche en file d'attente ; elle reste **held**, sans envoi.

Un test réel d'envoi nécessite un groupe que vous contrôlez, une session Telegram valide, le Cron, les migrations Supabase précédentes et l'activation volontaire `NASHRA_AUTOMATION_ENABLED=1` et `NASHRA_PUBLISHING_ENABLED=1` sur le **serveur uniquement**. **N'activez pas ces paramètres avant de confirmer les tests et les destinataires.** Les restrictions imposées par Telegram doivent être respectées.

## Périmètre et validation

Tests automatiques : préparation texte, transfert, photos, permissions, pause, limite de longueur ; inspection statique des garde-fous du worker. Les tests ne contactent pas Telegram et ne valident pas Supabase en direct.
