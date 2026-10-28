const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const manifest=require('./manifest-step3.json');
let bad=0;
for(const item of manifest){
  const p=path.join(process.cwd(),...item.path.split('/'));
  const actual=fs.existsSync(p)?crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'):'';
  if(actual !== item.after){bad++; console.error('NON installé ou modifié:',item.path);}
}
if(bad){console.error(`${bad} fichier(s) manquants ou différents.`);process.exit(1)}
console.log(`Intégrité de la mise à jour : ${manifest.length}/${manifest.length} fichiers OK.`);
console.log('Ce contrôle ne teste PAS les requêtes Stripe, SQL réel ou les publications Telegram.');
