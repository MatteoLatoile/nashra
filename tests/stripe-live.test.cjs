'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { createHmac } = require('node:crypto');
const ts = require('typescript');
const root = join(__dirname, '..');
const targets = [
  'src/lib/nashra-bundle/stripe.ts',
  'src/app/api/billing/checkout/route.ts',
  'src/app/api/billing/portal/route.ts',
  'src/app/api/billing/status/route.ts',
  'src/app/api/billing/webhook/route.ts',
  'src/lib/billing/entitlements.ts',
];
function evaluate(src, customRequire) {
  const m = { exports: {} };
  const compiled = ts.transpileModule(readFileSync(join(root, src), 'utf8'), {
    fileName: src, reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, strict: true },
  });
  assert.equal((compiled.diagnostics || []).filter(x => x.category === ts.DiagnosticCategory.Error).length, 0, src);
  new Function('require', 'module', 'exports', compiled.outputText)(customRequire, m, m.exports);
  return m.exports;
}
const stripe = evaluate(targets[0], x => x === 'server-only' ? {} : require(x));
const prices = {
  STRIPE_LIVE_PRO_MONTHLY_PRICE_ID: 'price_1UVqEOHltcyvjFVc9qBEuczF',
  STRIPE_LIVE_PRO_YEARLY_PRICE_ID: 'price_1UVqEOHltcyvjFVcNA0CdKHD',
  STRIPE_LIVE_BUSINESS_MONTHLY_PRICE_ID: 'price_1UVqIcHltcyvjFVc2VH0HJKe',
  STRIPE_LIVE_BUSINESS_YEARLY_PRICE_ID: 'price_1UVqIcHltcyvjFVccAW3vp2Y',
};
function withEnv(env, run) {
  const old = {...process.env};
  try {Object.assign(process.env, env); return run();} finally { process.env = old; }
}

test('modified Stripe files transpile and SQL v2 RPC exists', () => {
  targets.forEach(src => evaluate(src, id => {
    if (id === 'server-only') return {};
    if (id.startsWith('@/')) return {};
    if (id === 'next/server') return {};
    return require(id);
  }));
  const sql = readFileSync(join(root, 'supabase/019_stripe_production_sync.sql'), 'utf8');
  for (const item of ['nashra_apply_subscription_event_v2','pg_advisory_xact_lock',
    'nashra_billing_events','ON CONFLICT (provider,provider_event_id) DO NOTHING',
    'nashra_entitlements','auth.role()',"'service_role'"])
    assert.ok(sql.includes(item), item);
});

test('production is fail-closed unless explicit opt-in, matching key and webhook secret', () => {
  const base = {NASHRA_BILLING_ENABLED:'1', NASHRA_BILLING_MODE:'live',
    STRIPE_SECRET_KEY:'sk_live_fake', STRIPE_WEBHOOK_SECRET:'whsec_fake'};
  withEnv({...base, NASHRA_BILLING_LIVE_CONFIRM:'NO'},()=> assert.equal(stripe.billingMode(),'disabled'));
  withEnv({...base, STRIPE_WEBHOOK_SECRET:'x', NASHRA_BILLING_LIVE_CONFIRM:'I_ACCEPT_REAL_CHARGES'},()=> assert.equal(stripe.billingMode(),'disabled'));
  withEnv({...base, STRIPE_SECRET_KEY:'sk_test_fake', NASHRA_BILLING_LIVE_CONFIRM:'I_ACCEPT_REAL_CHARGES'},()=> assert.equal(stripe.billingMode(),'disabled'));
  withEnv({...base, NASHRA_BILLING_LIVE_CONFIRM:'I_ACCEPT_REAL_CHARGES'},()=> assert.equal(stripe.billingMode(),'live'));
});

test('the four live plans use the supplied price IDs, and test IDs are isolated', () => {
  withEnv({NASHRA_BILLING_ENABLED:'1', NASHRA_BILLING_MODE:'live',
    NASHRA_BILLING_LIVE_CONFIRM:'I_ACCEPT_REAL_CHARGES',STRIPE_SECRET_KEY:'sk_live_fake',
    STRIPE_WEBHOOK_SECRET:'whsec_fake',...prices}, () => {
      assert.equal(stripe.configuredPrice('pro','month'),prices.STRIPE_LIVE_PRO_MONTHLY_PRICE_ID);
      assert.equal(stripe.configuredPrice('pro','year'),prices.STRIPE_LIVE_PRO_YEARLY_PRICE_ID);
      assert.equal(stripe.configuredPrice('business','month'),prices.STRIPE_LIVE_BUSINESS_MONTHLY_PRICE_ID);
      assert.equal(stripe.configuredPrice('business','year'),prices.STRIPE_LIVE_BUSINESS_YEARLY_PRICE_ID);
      const mk = (amount,interval) => ({livemode:true,active:true,type:'recurring',currency:'usd',unit_amount:amount,
        billing_scheme:'per_unit',recurring:{interval, interval_count:1,usage_type:'licensed'}});
      assert.equal(stripe.validStripePrice(mk(800,'month'),'month',800),true);
      assert.equal(stripe.validStripePrice(mk(19000,'year'),'year',19000),true);
      assert.equal(stripe.validStripePrice({...mk(800,'month'),livemode:false},'month',800),false);
      assert.equal(stripe.validStripePrice(mk(800,'month'),'year',800),false);
      assert.equal(stripe.validStripePrice(mk(1900,'month'),'month',800),false);
      const rights = evaluate('src/lib/billing/entitlements.ts',id=>id==='@/lib/nashra-bundle/stripe'?stripe:require(id));
      assert.equal(rights.tierFromVerifiedSubscription('active',prices.STRIPE_LIVE_PRO_MONTHLY_PRICE_ID),'pro');
      assert.equal(rights.tierFromVerifiedSubscription('trialing',prices.STRIPE_LIVE_BUSINESS_YEARLY_PRICE_ID),'business');
      assert.equal(rights.tierFromVerifiedSubscription('past_due',prices.STRIPE_LIVE_PRO_MONTHLY_PRICE_ID),'free');
    });
});

test('webhook signature rejects tampered payload and wrong timestamp',()=>{
  const secret='whsec_fake', payload='{"id":"evt_abc"}', timestamp=1760000000, now=timestamp*1000;
  const signature = createHmac('sha256',secret).update(`${timestamp}.${payload}`).digest('hex');
  const header=`t=${timestamp},v1=${signature}`;
  assert.equal(stripe.verifyStripeSignature(payload,header,secret,now),true);
  assert.equal(stripe.verifyStripeSignature(payload+' ',header,secret,now),false);
  assert.equal(stripe.verifyStripeSignature(payload,header,secret,now+301000),false);
});

test('signed LIVE subscription event syncs modern Stripe item-level periods using SQL v2', async () => {
  const env = {NASHRA_BILLING_ENABLED:'1',NASHRA_BILLING_MODE:'live',
    NASHRA_BILLING_LIVE_CONFIRM:'I_ACCEPT_REAL_CHARGES', STRIPE_SECRET_KEY:'sk_live_fake',
    STRIPE_WEBHOOK_SECRET:'whsec_fake',...prices};
  const previous = {...process.env}, originalFetch = global.fetch;
  Object.assign(process.env, env);
  try {
    const user = '12345678-1234-4234-8234-123456789abc';
    const stripeSub = {
      id:'sub_abc123', customer:'cus_abc123', created:1800000000, livemode:true,
      status:'active',cancel_at_period_end:false,metadata:{nashra_user_id:user},
      // Newer Stripe API does NOT include top-level current_period_start/end.
      items:{data:[{quantity:1,price:{id:prices.STRIPE_LIVE_PRO_MONTHLY_PRICE_ID},
        current_period_start:1800000000,current_period_end:1802678400}]},
    };
    let received = null;
    global.fetch = async () => ({ ok:true, status:200, json:async()=>stripeSub });
    const handler = evaluate('src/app/api/billing/webhook/route.ts',id=>{
      if (id === 'next/server') return {NextResponse:{json:(payload,options)=>({payload,status:options?.status||200})}};
      if (id === '@/lib/nashra-bundle/secure') return {noStore:{},adminDb:()=>({rpc:async(name,args)=>{
        received={name,args};return {error:null,data:true};
      }})};
      if (id === '@/lib/nashra-bundle/stripe') return stripe;
      if (id === '@/lib/billing/entitlements') return evaluate('src/lib/billing/entitlements.ts',
        module=>module === '@/lib/nashra-bundle/stripe'?stripe:require(module));
      return require(id);
    });
    const event = {id:'evt_abc123',type:'customer.subscription.created',created:1800000000,
      livemode:true,data:{object:{id:'sub_abc123'}}};
    const body=JSON.stringify(event);
    const now=Math.floor(Date.now()/1000);
    const sig=createHmac('sha256',env.STRIPE_WEBHOOK_SECRET).update(`${now}.${body}`).digest('hex');
    const response = await handler.POST({text:async()=>body, headers:{get:()=>`t=${now},v1=${sig}`}});
    assert.equal(response.status,200);
    assert.equal(received.name,'nashra_apply_subscription_event_v2');
    assert.equal(received.args.p_tier,'pro');
    assert.equal(received.args.p_interval,'month');
    assert.equal(received.args.p_livemode,true);
    assert.equal(received.args.p_period_end,new Date(1802678400*1000).toISOString());
  } finally {global.fetch=originalFetch;process.env=previous;}
});
