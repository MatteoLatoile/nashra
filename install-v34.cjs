'use strict';
// Nashra V3.4, idempotent. Run from the Nashra project root. UTF-8 safe on Windows.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = process.cwd();
const payload = path.join(root,'v34-files');
const modifications = new Map();
const failures = [];
const filePath = rel => path.join(root,...rel.split('/'));
const exists = rel => fs.existsSync(filePath(rel));
const read = rel => fs.readFileSync(filePath(rel),'utf8');
const newFiles = [
  ['src/lib/nashra-admin/guards.ts','src/lib/nashra-admin/guards.ts'],
  ['src/app/api/admin/v34/route.ts','src/app/api/admin/v34/route.ts'],
  ['src/app/api/admin/v34/cases/route.ts','src/app/api/admin/v34/cases/route.ts'],
  ['src/app/api/admin/v34/export/route.ts','src/app/api/admin/v34/export/route.ts'],
  ['supabase/010_admin_console.sql','supabase/010_admin_console.sql'],
];
if (!exists('src/lib/nashra-bundle/secure.ts') || !exists('src/app/(dashboard)/admin/page.tsx'))
  failures.push('La base V2.7 avec /admin doit déjà être installée.');
if (!exists('src/lib/billing/entitlements.ts') || !exists('supabase/009_subscription_limits.sql'))
  failures.push('La V3.3 (quotas) doit déjà être installée.');
if (!exists('src/app/globals.css') || !exists('tsconfig.json')) failures.push('Fichiers essentiels de Next.js absents.');
if (!fs.existsSync(payload)) failures.push('Dossier v34-files introuvable : extraire le ZIP entier.');
if (!failures.length) {
  for (const [rel,source] of newFiles) {
    const bytes = fs.readFileSync(path.join(payload,...source.split('/')));
    if (exists(rel)) {
      const old = fs.readFileSync(filePath(rel));
      if (old.equals(bytes)) continue;
      // Existing V3.4 file has been edited externally; do not erase user work.
      failures.push(`${rel} existe déjà et diffère du correctif. Aucun écrasement.`);
    } else modifications.set(rel,bytes);
  }
  const adminRel = 'src/app/(dashboard)/admin/page.tsx';
  const current = read(adminRel);
  const replacement = fs.readFileSync(path.join(payload,'src/app/(dashboard)/admin/page.tsx'));
  if (!current.includes('NASHRA_ADMIN_V34')) {
    if (!current.includes('/api/admin/summary') || !current.includes('PageHeader'))
      failures.push('La page /admin a une structure personnalisée. Installation arrêtée pour préserver vos modifications.');
    else modifications.set(adminRel,replacement);
  }
  const styleRel='src/app/globals.css';
  const style=read(styleRel);
  if (!style.includes('NASHRA_ADMIN_V34_STYLES')) {
    modifications.set(styleRel,Buffer.from(style.replace(/\s*$/,'')+'\n\n'+fs.readFileSync(path.join(payload,'admin-v34.css'),'utf8')+'\n','utf8'));
  }
  const tsRel='tsconfig.json';
  try {
    const config=JSON.parse(read(tsRel).replace(/^\uFEFF/,''));
    const excluded=new Set(Array.isArray(config.exclude)?config.exclude:['node_modules']);
    for (const pattern of ['nashra-backups','nashra-auth-backup-*','backup-encodage-*','.nashra-*']) excluded.add(pattern);
    if (excluded.size !== (config.exclude||[]).length) {
      config.exclude=[...excluded];
      modifications.set(tsRel,Buffer.from(JSON.stringify(config,null,2)+'\n'));
    }
  } catch { failures.push('tsconfig.json illisible.'); }
}
if (failures.length) {console.error('NASHRA V3.4 : INSTALLATION ARRÊTÉE, aucun fichier modifié.\n - '+failures.join('\n - '));process.exit(1);}
if (!modifications.size) {console.log('Nashra V3.4 déjà installée : aucun changement.');process.exit(0);}
const backup = path.join(root,'nashra-backups','v34-'+new Date().toISOString().replace(/[:.]/g,'-'));
for (const [rel] of modifications) {
  if (!exists(rel)) continue;
  const dest=path.join(backup,...rel.split('/'));
  fs.mkdirSync(path.dirname(dest),{recursive:true});
  fs.copyFileSync(filePath(rel),dest);
}
for (const [rel,contents] of modifications) {
  const dst=filePath(rel);
  fs.mkdirSync(path.dirname(dst),{recursive:true});
  const temp=dst+'.nashra-v34-tmp';
  fs.writeFileSync(temp,contents);
  fs.renameSync(temp,dst);
  console.log('INSTALLED',rel);
}
console.log('\nNashra V3.4 OK :',modifications.size,'fichiers, sauvegarde :',backup);
console.log('Étape suivante : SQL 010 dans Supabase, puis node .\\verify-v34.cjs et npm run typecheck.');
console.log('Aucun envoi Telegram ou paiement n’a été activé.');
