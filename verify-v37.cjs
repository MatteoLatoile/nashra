'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = process.cwd();
const specs = require('./manifest-v37.json');
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
let invalid = 0;
for (const spec of specs) {
  const file = path.join(root, ...spec.target.split('/'));
  const matches = fs.existsSync(file) && hash(fs.readFileSync(file)) === spec.after_sha256;
  console.log(matches ? 'OK' : 'ERREUR', spec.target);
  if (!matches) invalid++;
}
console.log(invalid ? `Échec : ${invalid} fichier(s) incorrect(s).` : 'Nashra V3.7 : 3 fichiers présents et intègres.');
if (invalid) process.exitCode = 1;
