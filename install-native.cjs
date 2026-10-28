/** Nashra core final patch; never overwrites unknown user modifications. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=process.cwd(),source=path.join(root,'nashra-native-payload');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
if(!fs.existsSync('package.json')||JSON.parse(fs.readFileSync('package.json','utf8')).name!=='nashra')throw Error('Ouvrez le dossier Nashra.');
const manifest=JSON.parse(fs.readFileSync(path.join(source,'manifest.json'),'utf8'));
const conflicts=[],pending=[];
for(const f of manifest){
 if(f.path.includes('..') || !/^(src\/|supabase\/|nashra-tests\/)/.test(f.path))throw Error('Chemin interdit');
 const from=path.join(source,f.path),to=path.join(root,f.path),old=fs.existsSync(to)?sha(to):null;
 if(!fs.existsSync(from)||sha(from)!==f.new_sha256)throw Error('Archive incomplète: '+f.path);
 if(old===f.new_sha256)continue;
 if(!f.allowed_sha256.includes(old))conflicts.push(f.path);else pending.push({from,to,old,rel:f.path});
}
if(conflicts.length){console.error('Installation arrêtée, aucun fichier modifié :\n'+conflicts.join('\n'));process.exit(2)}
if(!pending.length){console.log('Nashra : correctif déjà installé.');process.exit(0)}
const backup=path.join(root,'nashra-backups','native-'+new Date().toISOString().replace(/[:.]/g,'-'));
for(const f of pending){
 if(f.old){const b=path.join(backup,f.rel);fs.mkdirSync(path.dirname(b),{recursive:true});fs.copyFileSync(f.to,b)}
 fs.mkdirSync(path.dirname(f.to),{recursive:true});fs.copyFileSync(f.from,f.to+'.nashra-tmp');
}
const applied=[];
try{for(const f of pending){fs.renameSync(f.to+'.nashra-tmp',f.to);applied.push(f);console.log('OK',f.rel)}}
catch(e){for(const f of applied.reverse()){const b=path.join(backup,f.rel);if(fs.existsSync(b))fs.copyFileSync(b,f.to);else fs.rmSync(f.to,{force:true})}throw e}
finally{for(const f of pending)fs.rmSync(f.to+'.nashra-tmp',{force:true})}
console.log('Sauvegardes :',backup);
console.log('IMPORTANT : exécuter supabase/013_telegram_native.sql dans Supabase SQL Editor.');
console.log('Puis : node --test .\\nashra-tests\\native-schedule.test.cjs ; npm run typecheck');
