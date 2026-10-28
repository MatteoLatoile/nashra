/* Conservative Nashra recurring installation. Node 20+, no external modules. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=process.cwd(), packageRoot=__dirname;
const manifest=require('./manifest-recurring.json');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const target=p=>path.resolve(root,...p.split('/'));
const payload=p=>path.join(packageRoot,'payload',...p.split('/'));
const tasks=[];
function plan(p){
  const contents=fs.readFileSync(payload(p));
  const dest=target(p);
  if(fs.existsSync(dest)){
    const existing=fs.readFileSync(dest), h=sha(existing);
    if(h===sha(contents)) {console.log('Déjà installé :',p);return;}
    if(manifest.legacySha256[p]!==h) throw Error(`Fichier modifié depuis le ZIP de référence : ${p}. Aucun remplacement automatique.`);
  }
  tasks.push({p,contents});
}
if(!fs.existsSync(target('package.json')) || !fs.existsSync(target('src/lib/billing/quotas-server.ts')))
  throw Error('Lancez dans le dossier Nashra avec les quotas de l’étape 3 installés.');
for(const p of Object.keys(manifest.payloadSha256)) plan(p);
// Only patch the existing Campaign recurrence type in the user's CURRENT store.
const storePath='src/lib/store.tsx', storeText=fs.readFileSync(target(storePath),'utf8');
const previous="  recurrence?: { mode: 'once' | 'weekly'; weekdays: number[]; weeks: number };";
const next="  recurrence?: { mode: 'once' | 'weekly'; weekdays: number[]; weeks: number } |\n    { mode: 'interval'; intervalDays: number; timeZone: string; until?: string | null };";
if(!storeText.includes(next)){
  if(!storeText.includes(previous)) throw Error('Type Campaign inconnu : intervention manuelle requise dans src/lib/store.tsx.');
  tasks.push({p:storePath,contents:Buffer.from(storeText.replace(previous,next),'utf8')});
}
// Merge, never overwrite other Vercel cron configuration.
const configPath='vercel.json';
let config={};
if(fs.existsSync(target(configPath))){
  try{config=JSON.parse(fs.readFileSync(target(configPath),'utf8'));}
  catch{throw Error('vercel.json invalide : fusion automatique annulée.');}
}
if(config.crons!==undefined && !Array.isArray(config.crons)) throw Error('vercel.json: crons doit être un tableau.');
if(!(config.crons||[]).some(x=>x.path==='/api/cron/recurring')){
  const updated={...config,crons:[...(config.crons||[]),{path:'/api/cron/recurring',schedule:'30 0 * * *'}]};
  tasks.push({p:configPath,contents:Buffer.from(JSON.stringify(updated,null,2)+'\n','utf8')});
}
const backup=path.join(root,'nashra-backups','recurring-'+new Date().toISOString().replace(/[:.]/g,'-'));
for(const t of tasks){
  const dest=target(t.p);
  if(fs.existsSync(dest)){
    const old=path.join(backup,...t.p.split('/'));
    fs.mkdirSync(path.dirname(old),{recursive:true});
    fs.copyFileSync(dest,old);
  }
}
for(const t of tasks){
  const dest=target(t.p);fs.mkdirSync(path.dirname(dest),{recursive:true});
  const tmp=dest+'.nashra-temp-'+process.pid;
  fs.writeFileSync(tmp,t.contents);
  fs.renameSync(tmp,dest);
  console.log('Installé :',t.p);
}
console.log('\nNashra - récurrence + tutoriel installé. Aucun secret ni .env.local modifié.');
console.log('Sauvegarde (si fichiers existants) :',backup);
console.log('À faire : SQL 018, NASHRA_RECURRING_ENABLED=1, vérifier Cron, npm run typecheck/build.');
