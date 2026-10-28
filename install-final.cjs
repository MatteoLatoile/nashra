/** Nashra essential FINAL: atomic preflight, backups, multi-version support, idempotent. */
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=process.cwd();
const source=path.join(root,'nashra-final-payload');
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function fail(msg,code=1){console.error(msg);process.exit(code)}
if (!fs.existsSync(path.join(root,'package.json')) || JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).name!=='nashra') fail('Lancez la commande à la racine du projet Nashra.');
if (!fs.existsSync(path.join(source,'manifest.json'))) fail('Archive incomplète : nashra-final-payload/manifest.json absent.');
const manifest=JSON.parse(fs.readFileSync(path.join(source,'manifest.json'),'utf8'));
const pending=[],conflicts=[];
for(const f of manifest){
  if (!/^(src\/|supabase\/)[A-Za-z0-9_./()\-]+$/.test(f.path)||f.path.includes('..')||path.isAbsolute(f.path))fail('Chemin de patch interdit : '+f.path);
  const from=path.join(source,f.path),dest=path.join(root,f.path);
  if(!fs.existsSync(from)||sha(from)!==f.new_sha256)fail('ZIP incomplet ou corrompu : '+f.path);
  const old=fs.existsSync(dest)?sha(dest):null;
  if(old===f.new_sha256)continue;
  if(!f.allowed_sha256.includes(old))conflicts.push(f.path);
  else pending.push({from,dest,rel:f.path,old});
}
if(conflicts.length){
 console.error('ARRÊT SANS AUCUNE MODIFICATION : ces fichiers ont été modifiés depuis la version source :');
 conflicts.forEach(p=>console.error(' - '+p));
 fail('Ne forcez pas le remplacement : transmettez ces fichiers pour une fusion sans perte.',2);
}
if(!pending.length){console.log('Nashra : correctif déjà installé. Aucune modification.');process.exit(0)}
const backup=path.join(root,'nashra-backups','final-'+new Date().toISOString().replace(/[:.]/g,'-'));
// Prepare all backups and temporary files BEFORE applying any modification.
for(const f of pending){
 if(f.old){const dst=path.join(backup,f.rel);fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(f.dest,dst)}
 fs.mkdirSync(path.dirname(f.dest),{recursive:true});
 fs.copyFileSync(f.from,f.dest+'.nashra-final-tmp');
}
const applied=[];
try {
 for(const f of pending){fs.renameSync(f.dest+'.nashra-final-tmp',f.dest);applied.push(f);console.log('INSTALLÉ '+f.rel)}
} catch(err){
 console.error('Échec de copie : tentative de restauration des fichiers modifiés.');
 for(const f of applied.reverse()){
  const previous=path.join(backup,f.rel);
  if(fs.existsSync(previous))fs.copyFileSync(previous,f.dest);
  else fs.rmSync(f.dest,{force:true});
 }
 throw err;
} finally{
 for(const f of pending)fs.rmSync(f.dest+'.nashra-final-tmp',{force:true});
}
console.log('\n'+pending.length+' fichier(s) mis à jour. Sauvegardes : '+backup);
console.log('Si pas déjà exécutée, appliquer la migration SQL 012_manual_claim.sql dans Supabase.');
console.log('Ensuite : node .\\verify-final.cjs ; node --test .\\nashra-tests\\final-flow.test.cjs ; npm run typecheck ; npm run build');
console.log('Aucun envoi automatique ni paiement ne sont activés par ce correctif.');
