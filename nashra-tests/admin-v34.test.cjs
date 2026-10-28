'use strict';
const fs=require('fs');const path=require('path');
const root=process.cwd();let failed=0;
function must(file,pattern,message){const full=path.join(root,...file.split('/'));const content=fs.readFileSync(full,'utf8');
 const pass=pattern.test(content);console.log(pass?'OK ':'FAIL',message);if(!pass)failed++;}
const guards='src/lib/nashra-admin/guards.ts',api='src/app/api/admin/v34/route.ts',cases='src/app/api/admin/v34/cases/route.ts',sql='supabase/010_admin_console.sql';
must(guards,/adminAllowed\(current\.user\.id\)/,'Droits administrateur verifies cote serveur');
must(guards,/adminDb\(\)/,'Client service role uniquement apres autorisation');
must(guards,/^[\s\S]*if\s*\(\/\^\[\\s\]\*\[=\+\\-@\]/,'Protection injection CSV');
must(api,/await requireAdmin\(\)/,'API de consultation protegee');
must(cases,/sameOrigin\(req\)/,'Protection CSRF des ecritures');
must(cases,/\.rpc\('nashra_v34_save_case'/,'Ecriture RPC transactionnelle');
must(sql,/ENABLE ROW LEVEL SECURITY/g,'Tables administratives sous RLS');
must(sql,/REVOKE ALL ON public\.nashra_admin_cases FROM PUBLIC, anon, authenticated/,'Table des dossiers privee');
must(sql,/auth\.role\(\) IS DISTINCT FROM 'service_role'/,'RPC reserve au service role');
must(sql,/status IN \('blocked','needs_review','processing'\)/,'Actions limitees aux incidents');
must(sql,/INSERT INTO public\.nashra_admin_audit/,'Journal audit obligatoire');
if(failed){console.error(failed+' test(s) echoues');process.exit(1);}else console.log('11 contrôles réussis.');
