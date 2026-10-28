'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = process.cwd();
const manifest = require('./manifest-v37.json');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const filepath = relative => path.join(root, ...relative.split('/'));
try {
  const pkg = filepath('package.json');
  if (!fs.existsSync(pkg) || JSON.parse(fs.readFileSync(pkg, 'utf8')).name !== 'nashra') {
    throw Error('Lancez ce programme depuis la racine du projet Nashra.');
  }
  // All checks are done before ANY change to the user's source files.
  const changes = manifest.map(spec => {
    const from = filepath(spec.source);
    const to = filepath(spec.target);
    if (!fs.existsSync(from) || sha(fs.readFileSync(from)) !== spec.after_sha256) {
      throw Error(`ZIP incomplet ou corrompu : ${spec.source}`);
    }
    const current = fs.existsSync(to) ? sha(fs.readFileSync(to)) : null;
    if (current === spec.after_sha256) return { ...spec, from, to, status: 'already' };
    if (current !== spec.before_sha256) {
      throw Error(`Version inattendue ou fichier modifié : ${spec.target}. Aucune modification effectuée.`);
    }
    return { ...spec, from, to, status: 'install' };
  });
  const needed = changes.filter(c => c.status === 'install');
  if (!needed.length) { console.log('Nashra V3.7 déjà installée. Aucun fichier modifié.'); process.exit(0); }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = filepath(`nashra-backups/media-v37-${stamp}`);
  for (const file of needed.filter(f => f.before_sha256 !== null)) {
    const dest = path.join(backup, ...file.target.split('/'));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(file.to, dest);
  }
  const written = [];
  try {
    for (const file of needed) {
      fs.mkdirSync(path.dirname(file.to), { recursive: true });
      fs.copyFileSync(file.from, file.to);
      written.push(file);
    }
    for (const file of needed) {
      if (sha(fs.readFileSync(file.to)) !== file.after_sha256) throw Error(`Copie non conforme : ${file.target}`);
    }
  } catch (err) {
    for (const file of written.reverse()) {
      if (file.before_sha256 === null) fs.rmSync(file.to, { force: true });
      else fs.copyFileSync(path.join(backup, ...file.target.split('/')), file.to);
    }
    throw err;
  }
  for (const file of needed) console.log('MIS A JOUR :', file.target);
  console.log('Nashra V3.7 installée.');
  console.log('Sauvegarde :', backup);
  console.log('Aucune publication et aucune activation du worker déclenchée.');
  console.log('Ensuite : node .\\verify-v37.cjs ; node .\\nashra-tests\\media-v37.test.cjs ; npm run typecheck');
} catch (err) {
  console.error('INSTALLATION REFUSÉE :', err.message);
  process.exitCode = 1;
}
