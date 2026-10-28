/* Explicitly opt in to a Vercel Pro cron schedule; does not activate sends. */
'use strict';
const fs=require('node:fs'); const path=require('node:path');
if (process.argv[2] !== '--vercel-pro') {
  console.log('Pour configurer le Cron Vercel Pro : node .\\configure-cron-v38.cjs --vercel-pro');
  console.log('Vercel Hobby ne prend pas en charge une fréquence de 10 minutes.');
  process.exit(0);
}
try {
  const name=path.resolve('vercel.json');
  const existing=fs.existsSync(name) ? JSON.parse(fs.readFileSync(name,'utf8')) : {};
  if (!existing || typeof existing!=='object' || Array.isArray(existing)) throw Error('vercel.json mal formé.');
  if (existing.crons != null && !Array.isArray(existing.crons)) throw Error('Champ crons invalide.');
  const crons=existing.crons||[];
  const entry={path:'/api/cron/nashra',schedule:'*/10 * * * *'};
  const same=crons.filter(x=>x && x.path===entry.path);
  if (same.length && (same.length!==1 || same[0].schedule!==entry.schedule))
    throw Error('Un Cron Nashra différent existe déjà; aucun écrasement.');
  if (same.length) { console.log('Cron Vercel Pro déjà configuré.'); process.exit(0); }
  if (fs.existsSync(name)) {
    const backup=name+'.backup-v38-'+new Date().toISOString().replace(/[:.]/g,'-');
    fs.copyFileSync(name,backup); console.log('Sauvegarde du vercel.json existant créée.');
  }
  const updated={...existing,crons:[...crons,entry]};
  if (!updated.$schema) updated.$schema='https://openapi.vercel.sh/vercel.json';
  fs.writeFileSync(name,JSON.stringify(updated,null,2)+'\n','utf8');
  console.log('Vercel Pro Cron ajouté (toutes les 10 min). IMPORTANT : aucun déploiement effectué.');
  console.log('Configurez CRON_SECRET et les secrets serveur dans Vercel; laissez les drapeaux de publication à 0 pour commencer.');
} catch(error) { console.error('Configuration refusée : '+error.message); process.exitCode=1; }
