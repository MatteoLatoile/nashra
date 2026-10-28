/** Nashra 3.1: additive installer, UTF-8 safe, no external access and no credential reads. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const base = process.cwd();
const sourceRoot = path.join(__dirname, 'patch-files');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname,'manifest.json'), 'utf8'));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const read = rel => fs.readFileSync(path.join(base,rel),'utf8');
for (const [name,expected] of Object.entries(manifest.assets || {})) {
  const candidate = path.join(sourceRoot,name);
  if (!fs.existsSync(candidate) || hash(fs.readFileSync(candidate)) !== expected) throw Error(`Archive incomplète : ${name}`);
}
const stage = new Map();
const conflicts = [];
const skipped = [];
const required = ['src/components/shell.tsx','src/app/globals.css','src/lib/i18n/catalog.json','src/app/api/automation/queue/route.ts'];
for (const rel of required) if (!fs.existsSync(path.join(base,rel))) conflicts.push(`${rel} : fichier requis absent`);
for (const [rel,expected] of Object.entries(manifest.files)) {
  const src = path.join(sourceRoot,rel);
  if (!fs.existsSync(src) || hash(fs.readFileSync(src)) !== expected) throw Error(`Archive modifiée ou incomplète : ${rel}`);
  const dest = path.join(base,rel), target = fs.readFileSync(src);
  if (fs.existsSync(dest)) {
    if (hash(fs.readFileSync(dest)) === expected) { skipped.push(rel); continue; }
    conflicts.push(`${rel} existe et diffère : préservé`);
  } else stage.set(rel,target);
}
if (!conflicts.length) {
  const shell = 'src/components/shell.tsx';
  const oldShell = read(shell);
  if (!oldShell.includes("href: '/diagnostics'")) {
    const match = 'const menu = [';
    if (!oldShell.includes(match)) conflicts.push('shell.tsx : navigation non reconnue');
    else stage.set(shell,Buffer.from(oldShell.replace(match, `${match}\n  { label: 'Diagnostic', href: '/diagnostics', Icon: Activity },`),'utf8'));
  }
  const css = 'src/app/globals.css';
  const original = read(css);
  const addon = fs.readFileSync(path.join(sourceRoot,'diagnostics.css'),'utf8');
  if (!original.includes('/* Nashra v3.1 diagnostics')) stage.set(css,Buffer.from(original.replace(/\s*$/,'')+'\n\n'+addon,'utf8'));
  const catalog = 'src/lib/i18n/catalog.json';
  const current = JSON.parse(read(catalog));
  const added = JSON.parse(fs.readFileSync(path.join(sourceRoot,'diagnostics-i18n.json'),'utf8'));
  let changed = false;
  for (const [k,val] of Object.entries(added)) {
    if (!Object.hasOwn(current,k)) { current[k]=val; changed=true; }
  }
  if (changed) stage.set(catalog,Buffer.from(JSON.stringify(current,null,2)+'\n','utf8'));
  const queue = 'src/app/api/automation/queue/route.ts';
  const existingQueue = read(queue);
  if (existingQueue.includes('publishingEnabled: false')) {
    stage.set(queue,Buffer.from(existingQueue.replace('publishingEnabled: false',
      "publishingEnabled: process.env.NASHRA_AUTOMATION_ENABLED === '1' && process.env.NASHRA_PUBLISHING_ENABLED === '1'"),'utf8'));
  } else if (!existingQueue.includes("publishingEnabled: process.env.NASHRA_AUTOMATION_ENABLED")) {
    skipped.push('queue GET : retour déjà personnalisé, non modifié');
  }
}
if (conflicts.length) {
  console.error('INSTALLATION ARRÊTÉE avant modification :\n- '+conflicts.join('\n- '));
  console.error('Vos fichiers sont préservés. Fournissez le rapport pour un correctif ciblé.');
  process.exit(1);
}
if (!stage.size) { console.log('Nashra V3.1 : déjà installée. Aucun fichier modifié.'); process.exit(0); }
const backup = path.join(base,'nashra-backups','v31-'+new Date().toISOString().replace(/[:.]/g,'-'));
for (const rel of stage.keys()) {
  const original = path.join(base,rel);
  if (!fs.existsSync(original)) continue;
  const dest = path.join(backup,rel);
  fs.mkdirSync(path.dirname(dest),{ recursive: true });
  fs.copyFileSync(original,dest);
}
for (const [rel,bytes] of stage) {
  const dest = path.join(base,rel);
  fs.mkdirSync(path.dirname(dest),{ recursive: true });
  const temp = dest + '.nashra-v31-tmp';
  fs.writeFileSync(temp,bytes);
  fs.renameSync(temp,dest);
  console.log('OK',rel);
}
console.log(`\nNASHRA V3.1 INSTALLÉE · ${stage.size} fichiers ajoutés/actualisés.`);
console.log('Sauvegardes des fichiers remplacés :',backup);
console.log('Installer SQL 007 dans Supabase puis ouvrir /diagnostics.');
console.log('Tests : node .\\nashra-tests\\security.test.cjs && npm run typecheck');
