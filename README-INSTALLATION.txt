NASHRA V1.1 - ONBOARDING
========================

Dans le TERMINAL VS CODE, ouvert dans C:\Users\matte\nashra-v0.3 :

1. Ferme le serveur Next.js (Ctrl+C).
2. Expand-Archive "$HOME\Downloads\nashra-onboarding-v1.1.zip" -DestinationPath . -Force
3. node .\install-onboarding.cjs
4. npm run typecheck
5. npm run dev -- --port 3000

Première connexion => http://localhost:3000/bienvenue
Le guide peut ensuite être rouvert depuis le menu du profil ou la sidebar.

Aucune réinstallation npm. Aucun SQL. Aucun secret modifié.
Les fichiers modifiés sont sauvegardés dans nashra-backups/onboarding-*.

IMPORTANT : le guide ne déclenche aucune publication Telegram. Il ne remplace pas la configuration réelle du compte.
La connexion au compte Telegram a lieu dans /telegram et les annonces dans /annonces.
