// Nashra V2.1 — hash-checked, reversible installer.
'use strict';
const fs = require('node:fs'); const path = require('node:path'); const crypto = require('node:crypto');
const root=process.cwd(); const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest-v21.json'),'utf8'));
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
function fail(message){console.error('Installation interrompue : '+message);process.exit(1);}
if(!fs.existsSync(path.join(root,'package.json'))||JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).name!=='nashra')fail('Lancez le script à la racine de Nashra.');
const planned=[];
for(const f of manifest){
 if(!f.path.startsWith('src/')||f.path.includes('..'))fail('Chemin refusé.');
 const dest=path.resolve(root,f.path),src=path.resolve(root,'v21-files',f.path);
 if(!dest.startsWith(root+path.sep)||!src.startsWith(root+path.sep)||!fs.existsSync(src)||hash(src)!==f.after)fail('Archive incorrecte : '+f.path);
 if(fs.existsSync(dest)){
  const current=hash(dest);if(current===f.after)continue;
  if(current!==f.before)fail('Fichier modifié ou base V2.0 non correspondante : '+f.path+'. Aucun fichier touché.');
 }else if(f.before!==null)fail('Fichier V2.0 manquant : '+f.path);
 planned.push({f,dest,src,exists:fs.existsSync(dest)});
}
if(!planned.length){console.log('V2.1 déjà installée.');process.exit(0);}
const backup=path.join(root,'nashra-backups','v2.1-'+new Date().toISOString().replace(/[:.]/g,'-'));
for(const x of planned.filter(x=>x.exists)){const p=path.join(backup,x.f.path);fs.mkdirSync(path.dirname(p),{recursive:true});fs.copyFileSync(x.dest,p);}
const done=[];
try{for(const x of planned){fs.mkdirSync(path.dirname(x.dest),{recursive:true});fs.copyFileSync(x.src,x.dest);done.push(x);console.log('OK '+x.f.path);}}
catch(err){for(const x of done.reverse()){if(x.exists)fs.copyFileSync(path.join(backup,x.f.path),x.dest);else fs.rmSync(x.dest,{force:true});}fail('Erreur de copie; restauration tentée : '+String(err));}
console.log('Nashra V2.1 installée. Sauvegardes : '+backup);console.log('Exécutez npm run typecheck, puis visitez /automatisation');
