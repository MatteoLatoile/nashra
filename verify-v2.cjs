/** Checks exact patch files; compiler check remains `npm run typecheck`. */
'use strict';
const fs=require('node:fs'), path=require('node:path'), crypto=require('node:crypto');
const manifest=JSON.parse(fs.readFileSync('manifest-v2.json','utf8'));
let mismatch=0;
for(const item of manifest){const p=path.join(process.cwd(),item.path);const hash=fs.existsSync(p)?crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'):null;if(hash!==item.after){console.error('Vérification échouée :',item.path);mismatch++;}}
if(mismatch){console.error(mismatch,'fichier(s) différents de Nashra V2.0.');process.exitCode=1;}
else console.log('OK —',manifest.length,'fichiers Nashra V2.0 identiques au correctif. Exécutez ensuite npm run typecheck.');
