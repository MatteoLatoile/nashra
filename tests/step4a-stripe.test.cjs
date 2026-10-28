const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = f => fs.readFileSync(path.join(process.cwd(),f),'utf8');
const stripe = () => read('src/lib/nashra-bundle/stripe.ts');
test('production payments are explicitly disabled in this stage', () => {
  assert.match(stripe(),/NASHRA_BILLING_MODE === 'live'\) return 'disabled'/);
  assert.match(stripe(),/sk_test_/);
});
test('4 distinct test prices can be configured', () => {
  const s=stripe();
  for (const key of ['STRIPE_TEST_PRO_MONTHLY_PRICE_ID','STRIPE_TEST_PRO_YEARLY_PRICE_ID',
    'STRIPE_TEST_BUSINESS_MONTHLY_PRICE_ID','STRIPE_TEST_BUSINESS_YEARLY_PRICE_ID']) assert.ok(s.includes(key));
});
test('Stripe Price must match USD, billed interval, exact database amount and test environment', () => {
  const s=stripe();
  for (const guard of ["value.livemode === false", "value.currency === 'usd'",'value.unit_amount === usdCents',
    'recurring?.interval === interval','recurring.interval_count === 1','value.active === true']) assert.ok(s.includes(guard));
});
test('checkout passes chosen monthly / annual interval and reads expected cents from database', () => {
  const s=read('src/app/api/billing/checkout/route.ts');
  assert.match(s,/body\.interval !== 'month' && body\.interval !== 'year'/);
  assert.match(s,/plan\.annual_price_usd_cents : plan\.monthly_price_usd_cents/);
  assert.match(s,/validTestPrice\(remote, interval, expected\)/);
});
test('webhook tier mapping recognises yearly and monthly price IDs', () => {
  const s=read('src/lib/billing/entitlements.ts');
  for(const tier of ['pro','business']) for(const cycle of ['month','year'])
    assert.ok(s.includes(`configuredPrice('${tier}','${cycle}')`));
});
test('page offers both billing periods and sends selection to checkout', () => {
  const s=read('src/app/(dashboard)/abonnement/page.tsx');
  assert.match(s,/setInterval\(option\)/);
  assert.match(s,/JSON\.stringify\(\{tier,interval\}\)/);
  assert.match(s,/data\.plans\[tier\]\[interval\]/);
});
test('billing status reads database plan prices and validates each configured Stripe test Price', () => {
  const s=read('src/app/api/billing/status/route.ts');
  assert.match(s,/getQuotaSnapshot/);
  assert.match(s,/priceView\('pro','year'/);
  assert.match(s,/priceView\('business','month'/);
  assert.match(s,/validTestPrice\(remote, interval, expectedCents\)/);
});
