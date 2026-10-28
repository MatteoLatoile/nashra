const {readFileSync,existsSync}=require('node:fs');
const {resolve}=require('node:path');
const {createHash}=require('node:crypto');
const manifest=require('./manifest-step4a.json');
let errors=0;
for(const file of manifest){
 const target=resolve(process.cwd(),...file.path.split('/'));
 const ok=existsSync(target) && createHash('sha256').update(readFileSync(target)).digest('hex')===file.after;
 console.log(`${ok?'OK':'ERREUR'} ${file.path}`);
 if(!ok) errors++;
}
if(errors){console.error(`Échec de ${errors} contrôles.`);process.exit(1);}
console.log('NASHRA_STEP4A_FILES_OK');
