/* Safe live smoke test: uses ONLY dry_run, never invokes delivery or reconciliation. */
'use strict';
const fs=require('node:fs');
let target;
try {
  target=new URL(process.argv[2]);
  if (target.protocol !== 'https:' || !target.hostname || target.username || target.password || target.search || target.hash || target.pathname !== '/') {
    throw Error('URL invalide');
  }
} catch {
  console.error('Utilisation : node .\\check-deployed-cron-v38.cjs https://votre-application.example/');
  process.exit(1);
}
function getSecret() {
  if (process.env.CRON_SECRET) return process.env.CRON_SECRET;
  if (!fs.existsSync('.env.local')) return '';
  const line=fs.readFileSync('.env.local','utf8').split(/\r?\n/)
    .find(s=>/^\s*CRON_SECRET\s*=/.test(s));
  return line ? line.replace(/^\s*CRON_SECRET\s*=\s*/, '').trim().replace(/^(['"])(.*)\1$/,'$2') : '';
}
const secret=getSecret();
if (secret.length < 32) {
  console.error('CRON_SECRET absent ou trop court sur ce poste. Définissez la même valeur que sur le serveur sans la partager.');
  process.exit(1);
}
const url=new URL('/api/cron/nashra?dry_run=1',target);
(async()=>{
  const unauth=await fetch(url,{headers:{'Cache-Control':'no-store'},redirect:'manual',signal:AbortSignal.timeout(12000)});
  if (unauth.status!==401) throw Error('Sans jeton, réponse inattendue HTTP '+unauth.status+' (attendu 401).');
  const auth=await fetch(url,{headers:{Authorization:'Bearer '+secret,'Cache-Control':'no-store'},redirect:'manual',signal:AbortSignal.timeout(12000)});
  if (auth.status!==200) throw Error('Avec jeton, réponse inattendue HTTP '+auth.status+' (attendu 200).');
  const data=await auth.json();
  if (data.state!=='dry_run') throw Error('Le serveur ne semble pas avoir la version V3.8, refus de poursuivre.');
  console.log('Nashra V3.8 : contrôles HTTP production réussis.');
  console.log('Sans token : 401. Avec token : dry_run.');
  console.log('Publication activée : '+(data.publishing_enabled===true?'oui':'non'));
  console.log('Automatisation activée : '+(data.automation_enabled===true?'oui':'non'));
  console.log('Aucun message envoyé ; aucune tâche réclamée.');
})().catch(err=>{console.error('Test distant échoué : '+err.message);process.exitCode=1;});
