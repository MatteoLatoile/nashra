'use strict';
const fs=require('fs'), path=require('path');
const root=process.cwd();
const checks=[
 ['src/app/(dashboard)/admin/page.tsx','NASHRA_ADMIN_V34'],
 ['src/app/api/admin/v34/route.ts','requireAdmin'],
 ['src/app/api/admin/v34/cases/route.ts','sameOrigin'],
 ['src/app/api/admin/v34/export/route.ts','csv('],
 ['src/lib/nashra-admin/guards.ts','server-only'],
 ['supabase/010_admin_console.sql','nashra_v34_save_case'],
 ['src/app/globals.css','NASHRA_ADMIN_V34_STYLES'],
];
let failed=0;
for(const [name,needle] of checks){
 const filepath=path.join(root,...name.split('/'));
 const ok=fs.existsSync(filepath)&&fs.readFileSync(filepath,'utf8').includes(needle);
 console.log(ok?'OK  ':'FAIL',name);
 if(!ok)failed++;
}
console.log('\nVérification V3.4:',failed?'ÉCHEC':'RÉUSSIE',failed,'anomalie(s)');
if(failed)process.exit(1);
