'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const specs = require('./manifest-v36.json');
const root = process.cwd();
const digest = p => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, ...p.split('/')))).digest('hex');
let ok = true;
for (const item of specs) {
  try {
    const result = digest(item.target) === item.after_sha256;
    console.log(result ? 'OK' : 'ERREUR', item.target);
    if (!result) ok = false;
  } catch { console.error('MANQUANT', item.target); ok = false; }
}
if (!ok) process.exit(1);
console.log('Nashra V3.6 vérifiée. Le serveur Telegram et Supabase ne sont pas testés ici.');
