const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const base = process.cwd();
const here = __dirname;
const bundle = path.join(here,'bundle-files');
const marker = '/* Nashra V2.5-2.7 — Operations, Billing and Admin */';
function read(rel){ return fs.readFileSync(path.join(base,rel),'utf8'); }
function hash(content){ return crypto.createHash('sha256').update(content).digest('hex'); }
const sources = JSON.parse(fs.readFileSync(path.join(here,'manifest-bundle.json'),'utf8'));
const targets = Object.keys(sources);
const cssRel = 'src/app/globals.css';
const shellRel = 'src/components/shell.tsx';
const queueRel = 'src/app/(dashboard)/file-attente/page.tsx';
const shellAfter = "  { label: 'Opérations', href: '/operations', Icon: Activity },\n  { label: 'Abonnement', href: '/abonnement', Icon: CreditCard },";
const shellAnchor = "  { label: 'Historique', href: '/historique', Icon: History },";
const queueAnchor = '<div className="n23-toolbar"><Link href="/planification"';
const queueNew = '<div className="n23-toolbar"><Link href="/operations" className="btn btn-secondary">Centre des opérations</Link><Link href="/planification"';
const expected = ['src/lib/automation/worker.ts','src/app/api/cron/nashra/route.ts','supabase/005_delivery_worker.sql',cssRel,queueRel];
for(const rel of expected){ if(!fs.existsSync(path.join(base,rel))) throw new Error('Prérequis V2.4 absent : '+rel+'\nAucun changement.'); }
for(const rel of targets){
  const destination = path.join(base,rel);
  if(!fs.existsSync(path.join(bundle,rel))) throw new Error('Archive incomplète : '+rel);
  if(fs.existsSync(destination) && hash(fs.readFileSync(destination)) !== sources[rel])
    throw new Error('Conflit avec un fichier existant : '+rel+'.\nAucun changement ; conservez ce fichier pour fusion.');
}
let css = read(cssRel);
let shell = fs.existsSync(path.join(base,shellRel)) ? read(shellRel) : null;
let queue = read(queueRel);
if(!css.includes(marker) && !css.includes(':root')) throw new Error('CSS inattendu ; installation arrêtée.');
if(shell && !shell.includes("href: '/operations'")) {
  if(!shell.includes(shellAnchor) || !shell.includes('from \'lucide-react\'')) throw new Error('Menu personnalisé non reconnu : installation arrêtée pour protéger vos fichiers.');
}
if(!queue.includes('href="/operations"') && !queue.includes(queueAnchor)) throw new Error('File d’attente personnalisée non reconnue : arrêt sans modification.');
const backup = path.join(base,'nashra-backups','bundle-v27-'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(backup,{recursive:true});
function backupFile(rel) { const dest=path.join(backup,rel); fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(base,rel),dest); }
let added = 0; let changed = 0;
for(const rel of targets) {
  const destination=path.join(base,rel);if(fs.existsSync(destination)) continue;
  fs.mkdirSync(path.dirname(destination),{recursive:true});
  fs.copyFileSync(path.join(bundle,rel),destination);added++;
}
if(!css.includes(marker)) { backupFile(cssRel); fs.appendFileSync(path.join(base,cssRel),'\n'+fs.readFileSync(path.join(bundle,cssRel),'utf8'),'utf8');changed++; }
if(shell && !shell.includes("href: '/operations'")) {
  backupFile(shellRel);
  shell = shell.replace(shellAnchor,shellAnchor+'\n'+shellAfter);
  shell = shell.replace(' CalendarRange, History, Send, Settings2,', ' CalendarRange, History, Activity, CreditCard, Send, Settings2,');
  fs.writeFileSync(path.join(base,shellRel),shell,'utf8');changed++;
}
if(!queue.includes('href="/operations"')) {
  backupFile(queueRel);
  fs.writeFileSync(path.join(base,queueRel),queue.replace(queueAnchor,queueNew),'utf8');changed++;
}
console.log('Nashra V2.5–V2.7 installée.');
console.log('Nouveaux fichiers :',added, 'Modifiés :',changed);
console.log('Sauvegardes :',backup);
console.log('1) Exécutez supabase/006_billing_ops.sql dans Supabase SQL Editor.');
console.log('2) npm run typecheck');
console.log('3) /operations  /abonnement  /admin');
console.log('Stripe TEST désactivé et automatisation Telegram inchangée.');
