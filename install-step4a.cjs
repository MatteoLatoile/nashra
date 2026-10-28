/* Nashra étape 4A — installer avec sauvegarde, contrôle SHA-256, aucune écriture partielle. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = process.cwd();
const zipRoot = __dirname;
const manifest = require('./manifest-step4a.json');
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const full = (root, rel) => path.resolve(root, ...rel.split('/'));
const changes = [];
const failures = [];
for (const file of manifest) {
  const target = full(root,file.path);
  const payload = full(path.join(zipRoot,'payload'),file.path);
  if (!fs.existsSync(payload) || sha(payload) !== file.after) {
    failures.push(`${file.path} : patch endommagé`); continue;
  }
  const exists = fs.existsSync(target);
  const actual = exists ? sha(target) : null;
  if (actual === file.after) continue;
  if (actual !== file.before) {
    failures.push(`${file.path} : version de source différente. Aucun écrasement.`);continue;
  }
  changes.push({file,target,payload,exists});
}
if (failures.length) {
  console.error('Étape 4A non installée :\n - '+failures.join('\n - '));
  console.error('Vérifie que l’étape 3 est installée. Si ton code a changé, fournis un ZIP actualisé.');
  process.exit(1);
}
if (!changes.length) { console.log('Étape 4A déjà installée.'); process.exit(0); }
const stamp = new Date().toISOString().replace(/[:.]/g,'-');
const backups = path.join(root,'nashra-backups',`subscription-step4a-${stamp}`);
const written = [];
try {
  for (const change of changes) {
    if (!change.exists) continue;
    const backup = full(backups,change.file.path);
    fs.mkdirSync(path.dirname(backup),{recursive:true});
    fs.copyFileSync(change.target,backup);
  }
  for (const change of changes) {
    fs.mkdirSync(path.dirname(change.target),{recursive:true});
    fs.copyFileSync(change.payload,change.target);
    written.push(change);
    if (sha(change.target) !== change.file.after) throw new Error(`Hash incorrect: ${change.file.path}`);
  }
  console.log(`Étape 4A installée : ${changes.length} fichiers. Sauvegarde : ${backups}`);
  console.log('Aucune variable d’environnement ou donnée Supabase modifiée. Mode TEST uniquement.');
} catch(e) {
  console.error('Installation échouée, restauration des fichiers en cours : '+e.message);
  for (const change of written.reverse()) {
    try {
      if (change.exists) fs.copyFileSync(full(backups,change.file.path),change.target);
      else fs.rmSync(change.target,{force:true});
    } catch {console.error('Restauration manuelle nécessaire : '+change.file.path);}
  }
  process.exit(1);
}
