'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = process.cwd();
const base = path.join(__dirname,'nashra-billing-payload');
const manifest = require(path.join(base,'manifest.json'));
function digest(data){return crypto.createHash('sha256').update(data).digest('hex')}
function file(loc){return path.join(root,...loc.split('/'))}
function payload(loc){return path.join(base,...loc.split('/'))}
function error(msg){console.error('\n⛔ NASHRA ABONNEMENTS : '+msg);process.exit(1)}
if (!fs.existsSync(path.join(root,'package.json')) || !fs.existsSync(path.join(root,'src','app')))
  error('Exécutez cette commande dans le dossier racine du projet Nashra.');
// Preflight ALL files before writing a single byte.
const pending = [];
// Preserve the user's installed tutorial and profile while enabling the subscription entry.
const menuFile = file('src/components/account-menu.tsx');
if (!fs.existsSync(menuFile)) error('Menu avatar introuvable.');
const originalMenu = fs.readFileSync(menuFile,'utf8');
let newMenu = originalMenu;
const disabledEntry = /<div className="na-menu-disabled">\s*<CreditCard size=\{17\} \/>\s*<span>Abonnement<\/span>\s*<small>Bientôt<\/small>\s*<\/div>/;
if (disabledEntry.test(newMenu)) {
  newMenu = newMenu.replace(disabledEntry, `<Link href="/abonnement" onClick={close} role="menuitem">
              <CreditCard size={17} />
              <span>Abonnement</span>
            </Link>`);
} else if (!newMenu.includes('<Link href="/abonnement"')) {
  error('Menu avatar différent du projet de référence. Aucun fichier modifié.');
}
if (!newMenu.includes('const [accountTier,setAccountTier]')) {
  const anchor = 'const [imageError, setImageError] = useState(false);';
  if (!newMenu.includes(anchor)) error('État du menu avatar introuvable.');
  newMenu = newMenu.replace(anchor, anchor + `
  const [accountTier,setAccountTier] = useState<'free'|'pro'|'business'|'unknown'>('unknown');
  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetch('/api/billing/status', {cache:'no-store'})
      .then(async response => { if (!response.ok) throw new Error('Facturation indisponible');
        return response.json() as Promise<{tier?:string}>; })
      .then(result => { if (alive) setAccountTier(result.tier === 'pro' || result.tier === 'business' ? result.tier : 'free'); })
      .catch(() => { if (alive) setAccountTier('unknown'); });
    return () => { alive = false; };
  }, [open]);`);
}
if (newMenu.includes('<strong>Gratuit</strong>')) {
  newMenu = newMenu.replace('<strong>Gratuit</strong>', `<strong>{accountTier === 'unknown' ? '—' : accountTier === 'free' ? 'Gratuit' : accountTier === 'pro' ? 'Pro' : 'Business'}</strong>`);
}
if (!newMenu.includes("accountTier === 'unknown'")) error('Forfait actuel dans le menu avatar introuvable.');
const menuPending = originalMenu === newMenu ? null : {entry:{path:'src/components/account-menu.tsx'},target:menuFile,present:true,text:newMenu};

for (const entry of manifest.files) {
  const source = payload(entry.path);
  if (!fs.existsSync(source) || digest(fs.readFileSync(source)) !== entry.after)
    error('Archive endommagée : '+entry.path);
  const target = file(entry.path);
  const present = fs.existsSync(target);
  const hash = present ? digest(fs.readFileSync(target)) : null;
  if (hash === entry.after) continue;
  if (hash !== entry.before) error(`Conflit sur ${entry.path}. Ne pas forcer : le fichier est différent du projet de référence.`);
  pending.push({entry,source,target,present});
}
if (menuPending) pending.push(menuPending);
if (!pending.length){console.log('✅ Abonnements déjà installés. Rien à modifier.');process.exit(0)}
const backup = path.join(root,'nashra-backups','billing-'+new Date().toISOString().replace(/[.:]/g,'-'));
const done=[];
try {
  for (const item of pending) {
    if (item.present) {
      const dest=path.join(backup,...item.entry.path.split('/'));
      fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(item.target,dest);
    }
  }
  for (const item of pending) {
    fs.mkdirSync(path.dirname(item.target),{recursive:true});
    const temp=item.target+'.billing-new';
    if (typeof item.text === 'string') fs.writeFileSync(temp,item.text,'utf8');
    else fs.copyFileSync(item.source,temp);
    fs.renameSync(temp,item.target);
    done.push(item);
    console.log('✅ '+item.entry.path);
  }
  console.log('\n✅ Mise à jour des abonnements installée.');
  console.log('Sauvegardes : '+backup);
  console.log('Prochaine étape : appliquer supabase/014_billing_subscriptions.sql, puis npm run typecheck et npm run build.');
} catch(e) {
  console.error(e);
  for (const item of done.reverse()) {
    try {
      if (item.present)fs.copyFileSync(path.join(backup,...item.entry.path.split('/')),item.target);
      else fs.rmSync(item.target,{force:true});
    }catch {console.error('⚠️ Restauration manuelle requise : '+item.entry.path)}
  }
  error('Installation interrompue. Les fichiers connus ont été restaurés.');
}
