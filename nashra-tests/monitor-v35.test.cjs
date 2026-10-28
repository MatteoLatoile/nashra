const fs=require('node:fs');const assert=require('node:assert/strict');
const read=p=>fs.readFileSync(p,'utf8');
const cron=read('src/app/api/cron/nashra/route.ts');
const api=read('src/app/api/admin/v35/route.ts');
const exportRoute=read('src/app/api/admin/v35/export/route.ts');
const telemetry=read('src/lib/nashra-monitor/telemetry.ts');
const sql=read('supabase/011_worker_monitor.sql');
const install=read('install-v35.cjs');
const tests=[
 ['Cron conserve auth secret',()=>{assert.match(cron,/timingSafeEqual/);assert.match(cron,/!authorized\(request\)/)}],
 ['Une seule tentative worker par Cron',()=>assert.equal((cron.match(/runOneDelivery\(\)/g)||[]).length,1)],
 ['Un journal succes et echec',()=>{assert.match(cron,/recordWorkerRun\(\{ state: result\.state/);assert.match(cron,/recordWorkerRun\(\{ state: 'error'/)}],
 ['Journal ne republie jamais',()=>{assert.doesNotMatch(telemetry,/sendMessage|forwardMessages|runOneDelivery/)}],
 ['Controle admin API privee',()=>{assert.match(api,/requireAdmin\(\)/);assert.match(exportRoute,/requireAdmin\(\)/)}],
 ['Reponses limitees et cache off',()=>{assert.match(api,/\.limit\(200\)/);assert.match(exportRoute,/\.limit\(500\)/);assert.match(api,/jsonNoStore/)}],
 ['RLS privees',()=>{assert.match(sql,/ENABLE ROW LEVEL SECURITY/);assert.match(sql,/REVOKE ALL ON public\.nashra_worker_runs FROM PUBLIC, anon, authenticated/)}],
 ['Pas de secrets exportes dans la page',()=>{assert.doesNotMatch(api,/session_ciphertext|session_encryption_key|TELEGRAM_BOT_TOKEN/)}],
 ['Pas de desactivation RLS',()=>assert.doesNotMatch(sql,/DISABLE ROW LEVEL SECURITY/i)],
 ['Le correctif refuse les fichiers inconnus',()=>assert.match(install,/Refus de remplacer un fichier existant modifie/)],
];
for(const [name,fn] of tests){fn();console.log('PASS',name);}
console.log(`\n${tests.length} controles reussis.`);
