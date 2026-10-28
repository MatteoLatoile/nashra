const fs = require('fs');
const path = require('path');
const root = process.cwd();
const required = ['src/lib/automation/plan.ts','src/lib/automation/readiness.ts','src/app/(dashboard)/planification/page.tsx','src/app/globals.css'];
for (const rel of required) if (!fs.existsSync(path.join(root,rel))) throw Error('V2.2 manquante ou projet incomplet : '+rel);
const fresh = ['src/app/api/automation/queue/route.ts','src/app/(dashboard)/file-attente/page.tsx','supabase/004_delivery_queue.sql'];
for (const rel of fresh) {
 const src = path.join(__dirname,'v23-files',rel), dest=path.join(root,rel);
 if (!fs.existsSync(src)) throw Error('Archive incomplète : '+rel);
 if (fs.existsSync(dest) && !fs.readFileSync(dest).equals(fs.readFileSync(src))) throw Error('Fichier déjà personnalisé, installation annulée : '+rel);
}
const cssTarget=path.join(root,'src/app/globals.css');
const cssMarker='/* Nashra V2.3 — approval queue */';
const css=fs.readFileSync(cssTarget,'utf8');
const addition=fs.readFileSync(path.join(__dirname,'v23-files/src/app/globals.css'),'utf8');
const backup=path.join(root,'nashra-backups','v23-'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(backup,{recursive:true});
if (!css.includes(cssMarker)) {
 fs.mkdirSync(path.join(backup,'src/app'),{recursive:true});fs.copyFileSync(cssTarget,path.join(backup,'src/app/globals.css'));
 fs.writeFileSync(cssTarget,css+'\n'+addition,'utf8');
}
for (const rel of fresh) {
 const src=path.join(__dirname,'v23-files',rel),dest=path.join(root,rel);
 if (fs.existsSync(dest)) continue;
 fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(src,dest);
}
console.log('✅ V2.3 installée. Sauvegarde CSS :',backup);
console.log('➡ Exécutez supabase/004_delivery_queue.sql puis npm run typecheck.');
console.log('➡ Page : http://localhost:3000/file-attente — aucun envoi Telegram.');
