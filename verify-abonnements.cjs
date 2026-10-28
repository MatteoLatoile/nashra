'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=process.cwd();
const manifest=require(path.join(__dirname,'nashra-billing-payload','manifest.json'));
const errors=[];
for(const item of manifest.files){
  const file=path.join(root,...item.path.split('/'));
  if(!fs.existsSync(file)){errors.push('Manquant : '+item.path);continue}
  if(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==item.after)
    errors.push('Différent : '+item.path);
}
const menuPath=path.join(root,'src','components','account-menu.tsx');
const menu=fs.existsSync(menuPath)?fs.readFileSync(menuPath,'utf8'):'';
if(!menu.includes('<Link href="/abonnement"') || !menu.includes('const [accountTier,setAccountTier]'))
  errors.push('Menu avatar non relié aux abonnements.');
if(errors.length){console.error(errors.join('\n'));process.exit(1)}
console.log('✅ '+manifest.files.length+' fichiers d’abonnement conformes.');
console.log('⚠️ Valider ensuite npm run typecheck, npm run build et un abonnement Stripe TEST réel.');
