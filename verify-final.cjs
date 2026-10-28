/** Read-only Nashra final checks. Never contacts Supabase or Telegram, never prints secrets. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = process.cwd();
const check = (name, ok, advice) => { console.log(`${ok ? 'OK' : 'À FAIRE'}  ${name}${ok ? '' : ' — ' + advice}`); return ok; };
if (!fs.existsSync('package.json') || JSON.parse(fs.readFileSync('package.json', 'utf8')).name !== 'nashra') throw Error('Exécutez depuis le dossier du projet Nashra.');
const required = [
  'src/app/(dashboard)/annonces/page.tsx',
  'src/app/(dashboard)/campagnes/page.tsx',
  'src/app/(dashboard)/historique/page.tsx',
  'src/app/(dashboard)/profil/page.tsx',
  'src/app/api/telegram/user/publish-announcement/route.ts',
  'src/app/api/automation/calendar/route.ts',
  'src/app/api/cron/nashra/route.ts',
  'src/lib/automation/worker.ts',
  'supabase/012_manual_claim.sql',
];
let all = true;
for (const file of required) all = check(path.basename(file), fs.existsSync(file), file) && all;
const envPath = path.join(root, '.env.local');
const env = fs.existsSync(envPath) ? fs.readFileSync(envPath,'utf8') : '';
const have = name => new RegExp(`^\\s*${name}\\s*=\\s*(?!$|REMPLACER|TON_|TA_).+`, 'm').test(env);
check('Supabase configuré', have('NEXT_PUBLIC_SUPABASE_URL') && have('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'), 'Complétez .env.local');
check('Telegram personnel configuré', have('TELEGRAM_API_ID') && have('TELEGRAM_API_HASH') && have('NASHRA_SESSION_ENCRYPTION_KEY'), 'Complétez .env.local');
check('Service role (serveur seulement)', have('SUPABASE_SERVICE_ROLE_KEY'), 'Nécessaire pour la file et les envois');
const automation = /NASHRA_AUTOMATION_ENABLED\s*=\s*1(?:\s|$)/m.test(env);
const publishing = /NASHRA_PUBLISHING_ENABLED\s*=\s*1(?:\s|$)/m.test(env);
console.log(`Mode envoi : ${publishing ? 'AUTORISÉ PAR FLAG' : 'DÉSACTIVÉ'} ; calendrier automatique : ${automation ? 'AUTORISÉ PAR FLAG' : 'DÉSACTIVÉ'}`);
console.log('ATTENTION : Les flags ne prouvent ni le déploiement du Cron ni l’autorisation des groupes.');
console.log('ATTENTION : Ce contrôle ne valide pas les migrations Supabase, les sessions ou les envois réels.');
if (!all) process.exitCode = 1;
