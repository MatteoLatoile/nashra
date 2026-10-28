const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = process.cwd();
const manifest = require('./manifest-v22.json');
const sourceRoot = path.join(root, 'v22-files');
const oldCss = path.join(root, 'src', 'app', 'globals.css');
const audit = path.join(root, 'src', 'lib', 'automation', 'readiness.ts');
const sourceFiles = manifest.files.map(rel => ({ rel, from: path.join(sourceRoot, rel), dest: path.join(root, rel) }));
if (!fs.existsSync(audit)) throw Error('V2.1 introuvable : installez et vérifiez Nashra V2.1 avant cette mise à jour.');
for (const f of sourceFiles) if (!fs.existsSync(f.from)) throw Error(`Patch incomplet : ${f.rel}`);
if (!fs.existsSync(oldCss)) throw Error('globals.css introuvable');
const css = fs.readFileSync(oldCss);
const currentHash = crypto.createHash('sha256').update(css).digest('hex');
const newCss = fs.readFileSync(path.join(sourceRoot, 'src/app/globals.css'));
const targetHash = crypto.createHash('sha256').update(newCss).digest('hex');
if (currentHash !== manifest.expectedCssV21Sha256 && currentHash !== targetHash) {
  throw Error('Votre CSS diffère de la V2.1 attendue. Installation annulée pour ne pas écraser vos personnalisations.');
}
for (const file of sourceFiles) {
  if (file.rel === 'src/app/globals.css' || !fs.existsSync(file.dest)) continue;
  if (!fs.readFileSync(file.dest).equals(fs.readFileSync(file.from))) {
    throw Error('Fichier existant différent : ' + file.rel + ' — installation annulée.');
  }
}
const backup = path.join(root, 'nashra-backups', 'v22-' + new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(backup, { recursive: true });
let changed = 0;
for (const f of sourceFiles) {
  const source = fs.readFileSync(f.from);
  if (fs.existsSync(f.dest) && fs.readFileSync(f.dest).equals(source)) continue;
  if (fs.existsSync(f.dest)) {
    const save = path.join(backup, f.rel);fs.mkdirSync(path.dirname(save), { recursive: true });fs.copyFileSync(f.dest,save);
  }
  fs.mkdirSync(path.dirname(f.dest), { recursive: true });fs.writeFileSync(f.dest,source);changed++;
}
console.log('Nashra V2.2 : ' + changed + ' fichiers installés.');
console.log('Sauvegardes : ' + backup);
console.log('Exécutez npm run typecheck puis ouvrez /planification');
