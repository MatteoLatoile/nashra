/* Nashra stage 3: hash-checked, backup-first, idempotent installer. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = process.cwd();
const manifest = require('./manifest-step3.json');
const packageRoot = __dirname;
function hash(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function here(rel) { return path.join(root,...rel.split('/')); }
const failures = [];
const changes = [];
for (const item of manifest) {
  const target = here(item.path);
  const payload = path.join(packageRoot,'payload',...item.path.split('/'));
  if (!fs.existsSync(payload) || hash(payload) !== item.after) {
    failures.push(`${item.path}: contenu du patch invalide`); continue;
  }
  const exists = fs.existsSync(target);
  const actual = exists ? hash(target) : null;
  if (actual === item.after) continue;
  if (actual !== item.before) failures.push(`${item.path}: fichier modifié depuis l'audit; installation arrêtée pour éviter de l'écraser`);
  else changes.push({item,target,payload,exists});
}
if (failures.length) {
  console.error('\nNASHRA étape 3 NON installée :\n - '+failures.join('\n - '));
  console.error('Aucun fichier du projet n’a été modifié. Fournissez votre nouveau ZIP si vos fichiers ont changé.');
  process.exit(1);
}
if (!changes.length) { console.log('Étape 3 déjà installée. Aucun changement.'); process.exit(0); }
const stamp = new Date().toISOString().replace(/[:.]/g,'-');
const backupRoot = path.join(root,'nashra-backups',`subscription-step3-${stamp}`);
const written = [];
try {
  // Back up everything first.
  for (const file of changes) {
    if (!file.exists) continue;
    const backup=path.join(backupRoot,...file.item.path.split('/'));
    fs.mkdirSync(path.dirname(backup),{recursive:true});
    fs.copyFileSync(file.target,backup);
  }
  // Then apply. Preserve external files, .env.local and package dependencies.
  for (const file of changes) {
    fs.mkdirSync(path.dirname(file.target),{recursive:true});
    fs.copyFileSync(file.payload,file.target);
    written.push(file);
    if (hash(file.target) !== file.item.after) throw new Error(`Contrôle SHA256 échoué: ${file.item.path}`);
  }
  console.log(`NASHRA étape 3 installée : ${changes.length} fichiers.`);
  console.log(`Sauvegardes : ${backupRoot}`);
  console.log('SUITE: exécutez supabase/016_quota_guards.sql dans Supabase SQL Editor puis tests/016_readonly_verification.sql.');
} catch(err) {
  for (const file of written.reverse()) {
    try {
      if (file.exists) fs.copyFileSync(path.join(backupRoot,...file.item.path.split('/')),file.target);
      else fs.rmSync(file.target,{force:true});
    } catch(e) {console.error('Restauration manuelle requise : '+file.item.path);}
  }
  console.error('Installation échouée, restauration tentée :',err.message);
  process.exit(1);
}
