/* In-memory route tests: never calls a real account, database, or network. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const filename=path.resolve('src/app/api/cron/nashra/route.ts');
const raw=fs.readFileSync(filename,'utf8');
const compiled=ts.transpileModule(raw,{fileName:filename,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true},reportDiagnostics:true});
assert.equal((compiled.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0,'Cron TypeScript syntax');
const secret='x'.repeat(48);
const env={CRON_SECRET:secret,NASHRA_AUTOMATION_ENABLED:'0',NASHRA_PUBLISHING_ENABLED:'0'};
let calls=[]; let throwWorker=false;
const json=(body,opts={})=>({body,status:opts.status||200,headers:opts.headers||{}});
const mocks={
  'next/server':{NextResponse:{json}},
  'node:crypto':require('node:crypto'),
  '@/lib/automation/worker':{runOneDelivery:async()=>{calls.push('worker');if(throwWorker)throw Error('SENSITIVE_123');return{state:'sent',id:'safe-id'};}},
  '@/lib/automation/reconcile':{reconcileQueue:async()=>{calls.push('reconcile');return{stalledFlagged:0,expiredFlagged:0};}},
  '@/lib/nashra-monitor/telemetry':{recordWorkerRun:async({state})=>{calls.push('telemetry:'+state);}},
};
const moduleObj={exports:{}};
new Function('module','exports','require','process','Buffer',compiled.outputText)(moduleObj,moduleObj.exports,name=>{
  if(!(name in mocks))throw Error('Unexpected import: '+name);return mocks[name];
},{env},Buffer);
const route=moduleObj.exports;
const request=(token='',url='https://test.local/api/cron/nashra')=>({headers:{get:()=>token?`Bearer ${token}`:null},nextUrl:new URL(url)});
async function expect(state,status=200,token=secret,url) {
  calls=[];
  const res=await route.GET(request(token,url));
  assert.equal(res.status,status); assert.equal(res.body.state,state);
  assert.equal(res.headers['Cache-Control'],'no-store');
  return {res,calls:[...calls]};
}
(async()=>{
  let x=await expect(undefined,401,'bad-token');assert.deepEqual(x.calls,[]);
  x=await expect(undefined,401,'');assert.deepEqual(x.calls,[]);
  x=await expect('dry_run',200,secret,'https://test.local/api/cron/nashra?dry_run=1');assert.deepEqual(x.calls,[]);
  assert.equal(x.res.body.automation_enabled,false);
  x=await expect('disabled');assert.deepEqual(x.calls,['telemetry:disabled']);
  env.NASHRA_AUTOMATION_ENABLED='1';env.NASHRA_PUBLISHING_ENABLED='1';
  x=await expect('dry_run',200,secret,'https://test.local/api/cron/nashra?dry_run=1');assert.deepEqual(x.calls,[]);
  assert.equal(x.res.body.automation_enabled,true);
  x=await expect('sent');assert.deepEqual(x.calls,['reconcile','worker','telemetry:sent']);
  throwWorker=true;calls=[];
  const fail=await route.GET(request(secret));assert.equal(fail.status,500);assert.deepEqual(calls,['reconcile','worker','telemetry:error']);
  assert.equal(JSON.stringify(fail).includes('SENSITIVE_123'),false,'No internal error leaks');
  console.log('Nashra V3.8 : sécurité Cron, dry-run, désactivation, exécution et erreurs testés sans réseau.');
})().catch(e=>{console.error(e);process.exitCode=1;});
