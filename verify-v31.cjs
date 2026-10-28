const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=process.cwd();
const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'manifest.json'),'utf8'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
let fail=0;
for(const [relative,expected] of Object.entries(manifest.files)) {
  const dest=path.join(root,relative);
  const ok=fs.existsSync(dest) && sha(fs.readFileSync(dest))===expected;
  console.log(ok?'OK  ':'FAIL', relative);
  if(!ok)fail++;
}
for(const [relative,needle] of [
  ['src/components/shell.tsx',"href: '/diagnostics'"],
  ['src/app/globals.css','/* Nashra v3.1 diagnostics'],
  ['src/app/api/automation/queue/route.ts',"publishingEnabled: process.env.NASHRA_AUTOMATION_ENABLED"],
  ['src/lib/i18n/catalog.json','Diagnostic du système']]){
  const dest=path.join(root,relative);
  const ok=fs.existsSync(dest) && fs.readFileSync(dest,'utf8').includes(needle);
  console.log(ok?'OK  ':'WARN',relative,'→',needle.slice(0,50));
  if(!ok && relative!=='src/app/api/automation/queue/route.ts')fail++;
}
console.log(fail?`V3.1 : ${fail} problème(s) à examiner.`:'V3.1 : fichiers vérifiés. SQL et réseau non vérifiés.');
process.exitCode=fail?1:0;
