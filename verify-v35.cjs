const fs=require('node:fs');
const checks=[
  ['src/app/api/cron/nashra/route.ts','recordWorkerRun'],
  ['src/app/(dashboard)/admin/page.tsx','n35-adminlink'],
  ['src/app/(dashboard)/surveillance-systeme/page.tsx','/api/admin/v35'],
  ['src/app/api/admin/v35/route.ts','requireAdmin'],
  ['src/app/api/admin/v35/export/route.ts','requireAdmin'],
  ['src/lib/nashra-monitor/telemetry.ts',"from('nashra_worker_runs')"],
  ['src/app/globals.css','NASHRA_V35_STYLES_START'],
  ['supabase/011_worker_monitor.sql','ENABLE ROW LEVEL SECURITY'],
];
let errors=0;
for(const [p,signature] of checks){
  const ok=fs.existsSync(p)&&fs.readFileSync(p,'utf8').includes(signature);
  console.log((ok?'OK  ':'FAIL')+' '+p);
  if(!ok)errors++;
}
if(errors){console.error(`\n${errors} verification(s) en echec.`);process.exitCode=1;}
else console.log('\nInstallation V3.5 verifiee localement. SQL et authentification restent a tester.');
