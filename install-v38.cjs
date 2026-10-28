/* Nashra V3.8 — one-file, guarded change. Never touches .env.local or enables publishing. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const manifest = require('./manifest-v38.json');
const root = process.cwd();
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const join = name => path.join(root, ...name.split('/'));
try {
  if (!fs.existsSync(join('package.json')) || JSON.parse(fs.readFileSync(join('package.json'))).name !== 'nashra')
    throw Error('Exécuter depuis la racine Nashra.');
  const cronName = 'src/app/api/cron/nashra/route.ts';
  const workerName = 'src/lib/automation/worker.ts';
  const from = join('v38-files/' + cronName);
  const to = join(cronName);
  if (!fs.existsSync(from) || sha(fs.readFileSync(from)) !== manifest.cron_after_sha256)
    throw Error('Archive V3.8 altérée ou incomplète.');
  if (!fs.existsSync(to) || !fs.existsSync(join(workerName)))
    throw Error('Prérequis absents : installer V3.5 et V3.7 avant V3.8.');
  const currentWorker = sha(fs.readFileSync(join(workerName)));
  if (currentWorker !== manifest.v37_worker_sha256)
    throw Error('Worker Telegram différent de V3.7 : aucun fichier modifié. Vérifier votre version.');
  const current = sha(fs.readFileSync(to));
  if (current === manifest.cron_after_sha256) { console.log('V3.8 déjà installée, aucun changement.'); process.exit(0); }
  if (current !== manifest.base_v35_cron_sha256)
    throw Error('Route Cron modifiée depuis V3.5 : installation annulée sans écrasement.');
  const backupName = 'nashra-backups/v38-cron-' + new Date().toISOString().replace(/[:.]/g, '-');
  const backup = join(backupName + '/' + cronName);
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  fs.copyFileSync(to, backup);
  try {
    fs.copyFileSync(from, to);
    if (sha(fs.readFileSync(to)) !== manifest.cron_after_sha256) throw Error('Contrôle intégrité après copie échoué.');
  } catch (err) { fs.copyFileSync(backup, to); throw err; }
  console.log('Nashra V3.8 : route Cron sécurisée mise à jour.');
  console.log('Sauvegarde : ' + path.relative(root, backup));
  console.log('Aucun envoi déclenché. Aucun secret modifié. Aucune tâche planifiée automatiquement.');
  console.log('Puis : node .\\nashra-tests\\cron-v38.test.cjs && npm run typecheck');
} catch (error) { console.error('Installation refusée : ' + error.message); process.exitCode = 1; }
