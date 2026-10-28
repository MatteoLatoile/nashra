'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const {createHmac} = require('node:crypto');
const ts = require(process.env.NASHRA_TS_MODULE || 'typescript');
const root = join(__dirname, '..', 'nashra-billing-payload');
function path(s) {return join(root,s)}
function compiled(src) {
  const text = readFileSync(path(src),'utf8');
  const result = ts.transpileModule(text,{fileName:src,reportDiagnostics:true,
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,strict:true}});
  assert.equal(result.diagnostics.filter(x=>x.category===ts.DiagnosticCategory.Error).length,0,src);
  return result.outputText;
}
function evaluate(src, customRequire) {
  const m={exports:{}};
  new Function('require','module','exports',compiled(src))(customRequire,m,m.exports);
  return m.exports;
}
const sources=[
  'src/lib/nashra-bundle/stripe.ts','src/lib/billing/entitlements.ts',
  'src/lib/billing/copy.ts','src/app/api/billing/checkout/route.ts',
  'src/app/api/billing/portal/route.ts','src/app/api/billing/status/route.ts',
  'src/app/api/billing/webhook/route.ts','src/app/(dashboard)/abonnement/page.tsx',
];
test('syntax TS/TSX for all 8 files',()=>{
  for(const f of sources) compiled(f);
});
test('billing mode is off by default; LIVE requires deliberate confirmation',()=>{
  const old={...process.env};
  const stripe=evaluate(sources[0],id=>id==='server-only'?{}:require(id));
  try {
    Object.assign(process.env,{NASHRA_BILLING_ENABLED:'1',STRIPE_SECRET_KEY:'sk_live_fake',NASHRA_BILLING_MODE:'test'});
    assert.equal(stripe.billingMode(),'disabled');
    process.env.NASHRA_BILLING_MODE='live';
    assert.equal(stripe.billingMode(),'disabled');
    process.env.NASHRA_BILLING_LIVE_CONFIRM='I_ACCEPT_REAL_CHARGES';
    assert.equal(stripe.billingMode(),'live');
    process.env.STRIPE_SECRET_KEY='sk_test_fake';
    assert.equal(stripe.billingMode(),'disabled');
    process.env.NASHRA_BILLING_MODE='test';
    assert.equal(stripe.billingMode(),'test');
    process.env.STRIPE_TEST_PRICE_ID='price_pro123';
    process.env.STRIPE_TEST_BUSINESS_PRICE_ID='price_biz123';
    assert.equal(stripe.configuredPrice('pro'),'price_pro123');
    assert.equal(stripe.configuredPrice('business'),'price_biz123');
  } finally {process.env=old}
});
test('signed events accept legitimate signature and reject tampering/replay',()=>{
  const stripe=evaluate(sources[0],id=>id==='server-only'?{}:require(id));
  const secret='whsec_testing123',body='{"livemode":false}',now=1800000000000,t=1800000000;
  const signature=createHmac('sha256',secret).update(`${t}.${body}`).digest('hex');
  const header=`t=${t},v1=${signature}`;
  assert.equal(stripe.verifyStripeSignature(body,header,secret,now),true);
  assert.equal(stripe.verifyStripeSignature(body+' ',header,secret,now),false);
  assert.equal(stripe.verifyStripeSignature(body,header,secret,now+301000),false);
});
test('paid tiers require active/trialing status AND matching configured price',()=>{
  const old={...process.env};
  try {
    Object.assign(process.env,{NASHRA_BILLING_ENABLED:'1',NASHRA_BILLING_MODE:'test',
      STRIPE_SECRET_KEY:'sk_test_fake', STRIPE_TEST_PRICE_ID:'price_PRO',STRIPE_TEST_BUSINESS_PRICE_ID:'price_BUS'});
    const stripe=evaluate(sources[0],id=>id==='server-only'?{}:require(id));
    const rights=evaluate(sources[1],id=>id==='@/lib/nashra-bundle/stripe'?stripe:require(id));
    assert.equal(rights.tierFromVerifiedSubscription('active','price_PRO'),'pro');
    assert.equal(rights.tierFromVerifiedSubscription('trialing','price_BUS'),'business');
    assert.equal(rights.tierFromVerifiedSubscription('past_due','price_BUS'),'free');
    assert.equal(rights.tierFromVerifiedSubscription('active','price_untrusted'),'free');
    assert.deepEqual(rights.QUEUE_LIMITS,{free:100,pro:300,business:500});
  } finally {process.env=old}
});
test('11 billing locales are complete',()=>{
  const copy=evaluate(sources[2],require);
  for(const lang of ['fr','en','ar','ru','es','it','de','id','fil','tr','ur']){
    const record=copy.billingCopy(lang);
    assert.equal(Object.keys(record).length,25,lang);
    for(const value of Object.values(record))assert.ok(typeof value==='string'&&value.trim().length>0,lang);
  }
});
test('database migration has atomic role-restricted webhook updates',()=>{
  const sql=readFileSync(path('supabase/014_billing_subscriptions.sql'),'utf8');
  for(const check of ['auth.role()','service_role','ON CONFLICT (user_id)','nashra_entitlements',
    'stripe_subscription_created_at','last_event_created','REVOKE ALL'])assert.ok(sql.includes(check),check);
});
