'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = process.cwd();
const dir = path.join(root, 'nashra-core-payload');
const h = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const pkg = path.join(root, 'package.json');
if (!fs.existsSync(pkg) || JSON.parse(fs.readFileSync(pkg,'utf8')).name !== 'nashra') {
  console.error('Lancez cette commande dans le dossier racine de Nashra.'); process.exit(1);
}
if (!fs.existsSync(path.join(dir,'manifest.json'))) {
  console.error('Archive incomplète : nashra-core-payload/manifest.json absent.'); process.exit(1);
}
const files = JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
const pending = [], conflicts=[];
for (const f of files) {
  if (!/^src\/[A-Za-z0-9_./()\-]+$/.test(f.path) || f.path.includes('..')) throw new Error('Chemin illégal : '+f.path);
  const src = path.join(dir,f.path), dest=path.join(root,f.path);
  if (!fs.existsSync(src) || h(src) !== f.new_sha256) throw new Error('Payload corrompu : '+f.path);
  const actual = fs.existsSync(dest) ? h(dest) : null;
  if (actual === f.new_sha256) continue;
  if (actual !== f.old_sha256) conflicts.push(f.path);
  else pending.push({src,dest,path:f.path});
}
if (conflicts.length) {
  console.error('STOP : les fichiers suivants diffèrent de la base validée. Rien n’a été modifié :');
  conflicts.forEach(f=>console.error(' - '+f));
  console.error('Il faut fusionner ces changements, pas forcer l’installation.');
  process.exit(2);
}
if (!pending.length) { console.log('Correctif déjà installé et vérifié.'); process.exit(0); }
const backups=path.join(root,'nashra-backups','publication-unique-'+new Date().toISOString().replace(/[:.]/g,'-'));
// Back up every original before the first write.
for (const f of pending) {
  const backup=path.join(backups,f.path);
  fs.mkdirSync(path.dirname(backup),{recursive:true});
  fs.copyFileSync(f.dest,backup);
}
for (const f of pending) {
  fs.mkdirSync(path.dirname(f.dest),{recursive:true});
  fs.copyFileSync(f.src, f.dest+'.nashra-tmp');
  fs.renameSync(f.dest+'.nashra-tmp', f.dest);
  console.log('UPDATED '+f.path);
}
console.log('Terminé. Sauvegardes : '+backups);
console.log('Vérifier : node .\\verify-core.cjs ; npm run typecheck');
console.log('Aucun SQL, aucun secret, aucun envoi Telegram.');
