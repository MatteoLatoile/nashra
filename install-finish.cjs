'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = process.cwd();
const packagePath = path.join(root, 'package.json');
const payloadDir = path.join(root, 'nashra-finish-payload');
const manifestPath = path.join(payloadDir, 'manifest.json');
function sha(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }

if (!fs.existsSync(packagePath) || JSON.parse(fs.readFileSync(packagePath,'utf8')).name !== 'nashra') {
  console.error('Dossier Nashra introuvable. Lancez cette commande depuis la racine du projet.');
  process.exit(1);
}
if (!fs.existsSync(manifestPath)) {
  console.error('nashra-finish-payload/manifest.json absent. Extrayez intégralement le ZIP dans Nashra.');
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(manifestPath,'utf8'));
let toWrite = [];
const conflicts = [];
for (const entry of manifest) {
  if (!/^(src\/|supabase\/)/.test(entry.path) || entry.path.includes('..')) throw Error('Chemin de patch interdit');
  const src = path.join(payloadDir, entry.path);
  const dest = path.join(root, entry.path);
  if (!fs.existsSync(src) || sha(src) !== entry.new_sha256) throw Error(`Archive modifiée ou incomplète : ${entry.path}`);
  const existing = fs.existsSync(dest) ? sha(dest) : null;
  if (existing === entry.new_sha256) continue; // already installed, idempotent
  if (existing !== entry.old_sha256) conflicts.push(entry.path);
  else toWrite.push({ src, dest, path: entry.path });
}
if (conflicts.length) {
  console.error('Installation interrompue AVANT modification : ces fichiers ont changé depuis le ZIP source fourni :');
  conflicts.forEach(p=>console.error(' - '+p));
  console.error('Aucune donnée n’a été modifiée. Transmettez les fichiers actuels pour fusionner les différences.');
  process.exit(2);
}
if (!toWrite.length) { console.log('✅ Correctif déjà installé et vérifié.'); process.exit(0); }
const dir = path.join(root, 'nashra-backups', 'essentiel-' + new Date().toISOString().replace(/[:.]/g,'-'));
for (const item of toWrite) {
  if (fs.existsSync(item.dest)) {
    const copy = path.join(dir, item.path);
    fs.mkdirSync(path.dirname(copy), {recursive:true});
    fs.copyFileSync(item.dest, copy);
  }
}
let count=0;
for (const item of toWrite) {
  fs.mkdirSync(path.dirname(item.dest), {recursive:true});
  const temp = item.dest + '.nashra-new';
  fs.copyFileSync(item.src, temp);
  fs.renameSync(temp,item.dest);
  count++;
  console.log('UPDATED', item.path);
}
console.log(`\n✅ ${count} fichier(s) installé(s).`);
console.log('Sauvegarde :',dir);
console.log('SQL à exécuter dans Supabase : supabase/012_manual_claim.sql');
console.log('Ensuite : node .\\verify-finish.cjs ; npm run typecheck ; npm run build');
console.log('Aucune publication automatique activée par l’installation.');
