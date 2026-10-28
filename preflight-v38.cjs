/* Offline preflight only. Does NOT call Telegram, Supabase, Vercel or the Cron. */
'use strict';
const fs=require('node:fs'); const path=require('node:path');
function loadEnv(file) {
  const obj={}; if (!fs.existsSync(file)) return obj;
  for (const line of fs.readFileSync(file,'utf8').split(/\r?\n/)) {
    const m=line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) obj[m[1]]=m[2].replace(/^(['"])(.*)\1$/,'$2');
  } return obj;
}
const env={...loadEnv(path.resolve('.env.local')),...process.env};
const exists=(p)=>fs.existsSync(path.resolve(p));
const defined=k=>typeof env[k]==='string' && env[k].trim()!=='' && !/^(REMPLACER|TON_|TA_CLE|YOUR_)/i.test(env[k]);
const flags={automation:env.NASHRA_AUTOMATION_ENABLED==='1',publication:env.NASHRA_PUBLISHING_ENABLED==='1'};
const checks=[
  ['Supabase URL',defined('NEXT_PUBLIC_SUPABASE_URL')||defined('SUPABASE_URL')],
  ['Supabase service role (serveur)',defined('SUPABASE_SERVICE_ROLE_KEY')],
  ['Telegram API ID',defined('TELEGRAM_API_ID')],
  ['Telegram API hash',defined('TELEGRAM_API_HASH')],
  ['Chiffrement sessions Telegram',defined('NASHRA_SESSION_ENCRYPTION_KEY')],
  ['Secret Cron (32 caractères minimum)',defined('CRON_SECRET') && env.CRON_SECRET.length>=32],
  ['Migration SQL 005 présente dans le projet',exists('supabase/005_delivery_worker.sql')],
  ['Migration SQL 008 présente dans le projet',exists('supabase/008_queue_reliability.sql')],
  ['Migration SQL 011 présente dans le projet',exists('supabase/011_worker_monitor.sql')],
  ['Worker V3.7 présent',exists('src/lib/automation/photos.ts')],
];
console.log('Nashra V3.8 — Contrôle de configuration local (aucun secret affiché)');
for (const [label,pass] of checks) console.log((pass?'[OK]  ':'[MANQUE]  ')+label);
console.log('Mode exécution : '+(flags.automation && flags.publication?'ACTIF (publication possible si Cron déployé et tâches approuvées)':'DÉSACTIVÉ'));
if (exists('vercel.json')) { try {const v=JSON.parse(fs.readFileSync('vercel.json','utf8'));console.log('Cron Vercel déclaré : '+(Array.isArray(v.crons)&&v.crons.some(c=>c.path==='/api/cron/nashra')?'oui':'non'));}catch{console.log('vercel.json non lisible');} }
else console.log('Cron Vercel déclaré : non (ou planificateur externe nécessaire)');
console.log('Ce contrôle ne prouve PAS que le serveur, Supabase ou Telegram sont accessibles.');
if (checks.some(x=>!x[1])) process.exitCode=1;
