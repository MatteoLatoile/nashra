const fs = require('node:fs'),path = require('node:path'),crypto=require('node:crypto');
const source=process.cwd();
const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'manifest-v32.json'),'utf8'));
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
let failed=0;
for(const [rel,info] of Object.entries(manifest.files)) {
  const f=path.join(source,rel),valid=fs.existsSync(f)&&hash(fs.readFileSync(f))===info.patched_sha256;
  console.log(valid?'OK':'FAIL',rel);if(!valid)failed++;
}
for(const [rel,needle] of [['src/components/shell.tsx',"href: '/supervision'"],['src/app/globals.css','/* Nashra v3.2 supervision'],['src/lib/i18n/catalog.json','"Supervision"']]){
 const f=path.join(source,rel),valid=fs.existsSync(f)&&fs.readFileSync(f,'utf8').includes(needle);
 console.log(valid?'OK':'FAIL',rel);if(!valid)failed++;
}
if(failed)process.exit(1);
console.log('V3.2 verified. Database migration and live execution still require testing.');
