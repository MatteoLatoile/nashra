const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const base = process.cwd();
const filesRoot = path.join(__dirname, 'v24-files');
const expected = JSON.parse(fs.readFileSync(path.join(__dirname,'manifest-v24.json'),'utf8'));
const replaced = Object.keys(expected);
const fresh = [
  'src/lib/automation/worker.ts',
  'src/app/api/cron/nashra/route.ts',
  'supabase/005_delivery_worker.sql',
];
const cssRel = 'src/app/globals.css';
const cssMarker = '/* Nashra V2.4 - controlled sending and review */';
function sha(content) { return crypto.createHash('sha256').update(content).digest('hex'); }
function read(rel) { return fs.readFileSync(path.join(base,rel)); }
function incoming(rel) { return fs.readFileSync(path.join(filesRoot,rel)); }
for (const rel of [...replaced,...fresh,cssRel]) {
  if (!fs.existsSync(path.join(filesRoot,rel))) throw new Error('Archive incomplète : '+rel);
}
for (const rel of replaced) {
  if (!fs.existsSync(path.join(base,rel))) throw new Error('Projet V2.3 introuvable : '+rel);
  const current = sha(read(rel));
  if (current !== expected[rel] && current !== sha(incoming(rel))) {
    throw new Error('Fichier personnalisé : '+rel+'\nAucun changement : transmettez ce fichier pour fusion sans perte.');
  }
}
for (const rel of fresh) {
  if (fs.existsSync(path.join(base,rel)) && sha(read(rel)) !== sha(incoming(rel))) {
    throw new Error('Conflit avec un fichier existant : '+rel+'\nAucun changement.');
  }
}
if (!fs.existsSync(path.join(base,cssRel))) throw new Error('CSS Nashra introuvable.');
const css = read(cssRel).toString('utf8');
const styles = incoming(cssRel).toString('utf8');
const backup = path.join(base,'nashra-backups','v24-'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(backup,{recursive:true});
let changes=0;
for (const rel of replaced) {
  const destination = path.join(base,rel);
  if (sha(read(rel)) === sha(incoming(rel))) continue;
  const save = path.join(backup,rel);
  fs.mkdirSync(path.dirname(save),{recursive:true});
  fs.copyFileSync(destination,save);
  fs.writeFileSync(destination,incoming(rel));
  changes++;
}
for (const rel of fresh) {
  const destination = path.join(base,rel);
  if (fs.existsSync(destination)) continue;
  fs.mkdirSync(path.dirname(destination),{recursive:true});
  fs.writeFileSync(destination,incoming(rel));
  changes++;
}
if (!css.includes(cssMarker)) {
  const dest = path.join(base,cssRel), save = path.join(backup,cssRel);
  fs.mkdirSync(path.dirname(save),{recursive:true});
  fs.copyFileSync(dest,save);
  fs.writeFileSync(dest,css+'\n'+styles,'utf8');
  changes++;
}
console.log('Nashra V2.4 installée :',changes,'fichier(s) ajouté(s)/modifié(s).');
console.log('Sauvegardes :',backup);
console.log('1. Exécuter supabase/005_delivery_worker.sql dans Supabase.');
console.log('2. npm run typecheck');
console.log('3. Par défaut AUCUN ENVOI : worker inactif tant que les secrets, le cron et les deux flags ne sont pas activés.');
