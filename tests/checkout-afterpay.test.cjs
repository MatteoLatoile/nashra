'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const ts = require('typescript');
const root = join(__dirname, '..');
const userId = '12345678-1234-4234-8234-123456789abc';
const price = 'price_1UVqEOHltcyvjFVc9qBEuczF';
const id = 'cs_live_ABCDEFGHIJKLMNOP';

function compiled(src) {
  const contents=readFileSync(join(root,src),'utf8');
  const result=ts.transpileModule(contents, {
    fileName:src, reportDiagnostics:true,
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,strict:true}
  });
  assert.equal(result.diagnostics.filter(x=>x.category===ts.DiagnosticCategory.Error).length,0,src);
  return result.outputText;
}
function makeHandler({signedIn=true,mode='live',sessionOwner=userId,checkoutState='complete',paymentStatus='paid',dbStatus='active',dbPrice=price,dbSubscription='sub_abcdefghijkl',dbCustomer='cus_abcdefghijkl',dbError=null}={}){
  const checkout={id,mode:'subscription',livemode:true,client_reference_id:sessionOwner,
    metadata:{nashra_user_id:sessionOwner,nashra_plan:'pro',nashra_interval:'month'},
    subscription:'sub_abcdefghijkl',customer:'cus_abcdefghijkl',status:checkoutState,payment_status:paymentStatus};
  const subscription={stripe_subscription_id:dbSubscription,stripe_customer_id:dbCustomer,
    stripe_livemode:true,price_id:dbPrice,status:dbStatus,
    current_period_end:'2099-12-31T23:59:59Z',cancel_at_period_end:false};
  const fakeUser={user:{id:userId},db:{from(table){ assert.equal(table,'nashra_subscriptions');return {
    select(){return this;},eq(){return this;},maybeSingle:async()=>({data:subscription,error:dbError})
  };}}};
  const mockModules={
    'next/server':{NextResponse:{json:(payload,options)=>({payload,status:options?.status||200})}},
    '@/lib/nashra-bundle/secure':{noStore:{},session:async()=>signedIn?fakeUser:null},
    '@/lib/billing/quotas-server':{ getEffectivePlan:async()=>({plan_slug:'pro'}) },
    '@/lib/nashra-bundle/stripe':{
      billingMode:()=>mode, configuredPrice:(tier,interval)=>tier==='pro'&&interval==='month'?price:null,
      stripeGet:async(path)=>{ assert.equal(path,`checkout/sessions/${id}`);return checkout; }
    },
  };
  const mod={exports:{}};
  new Function('require','module','exports',compiled('src/app/api/billing/checkout-result/route.ts'))(
    name=>mockModules[name]||require(name), mod,mod.exports
  );
  return mod.exports;
}
function request(s=id) {return {nextUrl:new URL(`https://www.usenashra.com/api/billing/checkout-result?session_id=${s}`)};}

test('post-payment files transpile and Stripe success URL contains session identifier',()=>{
  for(const f of ['src/app/(dashboard)/abonnement/page.tsx','src/components/checkout-result-notice.tsx','src/app/api/billing/checkout-result/route.ts']) compiled(f);
  const checkout=readFileSync(join(root,'src/app/api/billing/checkout/route.ts'),'utf8');
  assert.match(checkout,/success_url:.*session_id=\{CHECKOUT_SESSION_ID\}/);
});
test('protected endpoint refuses guest and other users Checkout sessions',async()=>{
  assert.equal((await makeHandler({signedIn:false}).GET(request())).status,401);
  assert.equal((await makeHandler({sessionOwner:'22345678-1234-4234-8234-123456789abc'}).GET(request())).status,403);
  assert.equal((await makeHandler().GET(request('bad_id'))).status,400);
});
test('success requires webhook-synced matching subscription, customer and price',async()=>{
  const active=await makeHandler().GET(request());
  assert.equal(active.status,200);assert.equal(active.payload.state,'active');assert.equal(active.payload.tier,'pro');
  assert.equal((await makeHandler({dbSubscription:'sub_different'}).GET(request())).payload.state,'processing');
  assert.equal((await makeHandler({dbPrice:'price_different'}).GET(request())).payload.state,'processing');
  assert.equal((await makeHandler({dbCustomer:'cus_different'}).GET(request())).payload.state,'processing');
  assert.equal((await makeHandler({dbStatus:'past_due'}).GET(request())).payload.state,'processing');
  assert.equal((await makeHandler({dbStatus:'canceled'}).GET(request())).payload.state,'needs_attention');
  assert.equal((await makeHandler({checkoutState:'open'}).GET(request())).payload.state,'waiting');
  assert.equal((await makeHandler({checkoutState:'expired'}).GET(request())).payload.state,'needs_attention');
  assert.equal((await makeHandler({paymentStatus:'unpaid'}).GET(request())).payload.state,'processing');
});
test('server error is not mistaken for payment success',async()=>{
  const fail=await makeHandler({dbError:new Error('DB offline')}).GET(request());
  assert.equal(fail.status,502);assert.match(fail.payload.error,/indisponible/);
});
