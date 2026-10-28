/** Offline preflight: does not open env files or display secret values. */
const fs=require('node:fs');
const path=require('node:path');
const base=process.cwd();
console.log('\nNASHRA — CONTRÔLE LOCAL / V3.1\n');
for(const rel of ['src/app/api/cron/nashra/route.ts','src/app/api/diagnostics/route.ts',
  'src/app/(dashboard)/diagnostics/page.tsx','src/lib/automation/worker.ts',
  'supabase/004_delivery_queue.sql','supabase/005_delivery_worker.sql',
  'supabase/006_billing_ops.sql','supabase/007_queue_guards.sql']){
  console.log(fs.existsSync(path.join(base,rel))?'[OK]    ':'[ABSENT]',rel);
}
const ts=path.join(base,'tsconfig.json');
if(fs.existsSync(ts)) {
  const config=fs.readFileSync(ts,'utf8');
  console.log(config.includes('nashra-auth-backup')?'[OK]    ':'[INFO]  ','Exclusions des dossiers de sauvegarde TypeScript');
}
console.log('\nCe test vérifie les fichiers, PAS les migrations Supabase exécutées, le Cron, ni les droits Telegram.');
console.log('Aucune variable secrète affichée.\n');
