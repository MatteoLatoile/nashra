/** Nashra 2.0 verified install, from the current project root. No dependencies. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = process.cwd();
const manifestPath = path.join(root, 'manifest-v2.json');
function sha(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }
function fail(message) { console.error('\nINSTALLATION ANNULÉE — ' + message); process.exit(1); }
if (!fs.existsSync(path.join(root, 'package.json'))) fail('Ouvrez le dossier racine du projet Nashra.');
let name;
try { name = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).name; } catch { fail('package.json non lisible.'); }
if (name !== 'nashra') fail('Ce projet ne semble pas être Nashra.');
if (!fs.existsSync(manifestPath)) fail('manifest-v2.json introuvable : décompressez entièrement le ZIP à la racine du projet.');
const changes = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const planned = [];
for (const file of changes) {
  if (!file.path.startsWith('src/') && file.path !== 'tsconfig.json') fail('Chemin non autorisé dans le manifeste.');
  const destination = path.resolve(root, file.path);
  const source = path.resolve(root, 'v2-files', file.path);
  if (!destination.startsWith(root + path.sep) || !source.startsWith(root + path.sep)) fail('Chemin inattendu.');
  if (!fs.existsSync(source) || sha(source) !== file.after) fail('Fichier du correctif altéré : ' + file.path);
  if (!fs.existsSync(destination)) {
    if (file.before !== null) fail('Fichier actuel introuvable : ' + file.path);
    planned.push({ file, destination, source, existed: false });
    continue;
  }
  const actual = sha(destination);
  if (actual === file.after) continue; // Idempotent re-run.
  if (file.before === null || actual !== file.before) fail('Ce fichier a changé depuis la copie que vous avez envoyée : ' + file.path + '\nAucun fichier modifié. Faites une nouvelle archive source avant d’écraser des modifications.');
  planned.push({ file, destination, source, existed: true });
}
if (!planned.length) { console.log('Nashra V2.0 déjà installée. Aucun changement.'); process.exit(0); }
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = path.join(root, 'nashra-backups', 'v2.0-' + stamp);
for (const item of planned.filter(x => x.existed)) {
  const copy = path.join(backup, item.file.path);
  fs.mkdirSync(path.dirname(copy), { recursive: true });
  fs.copyFileSync(item.destination, copy);
}
const done = [];
try {
  for (const item of planned) {
    fs.mkdirSync(path.dirname(item.destination), { recursive: true });
    fs.copyFileSync(item.source, item.destination);
    done.push(item);
    console.log('OK : ' + item.file.path);
  }
} catch (err) {
  for (const item of done.reverse()) {
    if (item.existed) fs.copyFileSync(path.join(backup, item.file.path), item.destination);
    else if (fs.existsSync(item.destination)) fs.unlinkSync(item.destination);
  }
  fail('La copie a échoué ; les modifications précédentes ont été restaurées. ' + String(err));
}
console.log('\nNASHRA V2.0 INSTALLÉE — ' + planned.length + ' fichiers mis à jour.');
console.log('Sauvegarde des fichiers précédents : ' + backup);
console.log('À suivre : node .\\verify-v2.cjs ; npm run typecheck ; npm run dev -- --port 3000');
console.log('Importation de photos Telegram : exécuter supabase/003_announcement_images.sql dans Supabase si ce n’est pas déjà fait.');
