const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
let ts;
try { ts = require('typescript'); } catch { console.error('TypeScript indisponible. Installez les dépendances habituelles de Nashra.');process.exit(2); }
const source = fs.readFileSync(path.join(process.cwd(),'src/lib/nashra-bundle/stripe.ts'),'utf8').replace("import 'server-only';",'');
const compiled = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}});
const sandbox = {module:{exports:{}},require,Buffer,URL,URLSearchParams,process,console};
sandbox.exports = sandbox.module.exports;
vm.runInNewContext(compiled.outputText,sandbox);
const verify = sandbox.module.exports.verifyStripeSignature;
const secret = 'whsec_nashra_test_only_1234';
const now = Date.now();const timestamp = Math.floor(now/1000);
const payload = JSON.stringify({id:'evt_nashra_test'});
const signature = `t=${timestamp},v1=${crypto.createHmac('sha256',secret).update(`${timestamp}.${payload}`).digest('hex')}`;
const cases = [
 ['Signature valide',verify(payload,signature,secret,now),true],
 ['Message modifié rejeté',verify(payload+'x',signature,secret,now),false],
 ['Signature malformée rejetée',verify(payload,'t=123,v1=incorrect',secret,now),false],
 ['Signature trop ancienne rejetée',verify(payload,signature,secret,now+600000),false]
];
let failures=0;
for(const [label,actual,expected] of cases) {if(actual===expected)console.log('OK',label);else {console.error('ÉCHEC',label);failures++;}}
process.exitCode = failures ? 1 : 0;
