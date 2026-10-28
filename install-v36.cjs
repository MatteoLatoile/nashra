'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = process.cwd();
const manifest = require('./manifest-v36.json');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const relative = value => path.join(root, ...value.split('/'));

const pkg = relative('package.json');
if (!fs.existsSync(pkg) || JSON.parse(fs.readFileSync(pkg, 'utf8')).name !== 'nashra') {
  console.error('Installation refusée : lancez la commande à la racine de Nashra.');
  process.exit(1);
}
let changes;
try {
  changes = manifest.map(spec => {
    const target = relative(spec.target);
    const source = relative(spec.source);
    if (!fs.existsSync(target) || !fs.existsSync(source)) {
      throw Error(`Fichier requis absent : ${spec.target} ou ${spec.source}. Avez-vous extrait le ZIP complet ?`);
    }
    const before = sha256(fs.readFileSync(target));
    const payload = fs.readFileSync(source);
    if (sha256(payload) !== spec.after_sha256) throw Error(`Intégrité du correctif invalide : ${spec.source}`);
    if (before === spec.after_sha256) return { ...spec, target, source, action: 'already' };
    if (before !== spec.before_sha256) throw Error(`Version inconnue : ${spec.target}. Rien n'a été modifié. Sauvegardez votre projet et faites vérifier ce fichier avant installation.`);
    return { ...spec, target, source, action: 'replace' };
  });
} catch (error) {
  console.error('ÉCHEC :', error.message);
  process.exit(1);
}

const pending = changes.filter(item => item.action === 'replace');
if (pending.length === 0) {
  console.log('Nashra V3.6 déjà installée. Aucun fichier modifié.');
  process.exit(0);
}
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = relative(`nashra-backups/publications-core-v36-${stamp}`);
try {
  // All source checks happen BEFORE any write. Back up all targets BEFORE replacing any.
  for (const item of pending) {
    const saved = path.join(backupRoot, ...item.target.slice(root.length + 1).split(path.sep));
    fs.mkdirSync(path.dirname(saved), { recursive: true });
    fs.copyFileSync(item.target, saved);
  }
  const installed = [];
  try {
    for (const item of pending) {
      fs.copyFileSync(item.source, item.target);
      installed.push(item);
      console.log('MIS À JOUR :', item.target.slice(root.length + 1));
    }
    const testDest = relative('nashra-tests/core-v36.test.cjs');
    const testSrc = relative('nashra-tests/core-v36.test.cjs');
    // Included directly in ZIP, no separate copy required.
    void testDest; void testSrc;
  } catch (error) {
    for (const item of installed) {
      const saved = path.join(backupRoot, ...item.target.slice(root.length + 1).split(path.sep));
      fs.copyFileSync(saved, item.target);
    }
    throw error;
  }
  console.log(`✅ Correctif cœur de publication installé (${installed.length} fichiers).`);
  console.log('Sauvegardes :', backupRoot);
  console.log('Étapes : node .\\verify-v36.cjs ; node .\\nashra-tests\\core-v36.test.cjs ; npm run typecheck');
  console.log('Aucun paramètre de publication activé. Aucun envoi Telegram déclenché.');
} catch (error) {
  console.error('Installation interrompue :', error.message);
  process.exit(1);
}
