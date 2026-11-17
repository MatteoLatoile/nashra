import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = (path) => readFileSync(new URL('../'+path, import.meta.url),'utf8');

test('075: free alert uses server tier and actual monthly sends at 80%',()=>{
 const source=read('src/components/quota-alert.tsx');
 assert.match(source,/snapshot\?\.tier === 'free'/);
 assert.match(source,/usage\.monthlySends\.used >= Math\.ceil\(usage\.monthlySends\.limit \* \.8\)/);
 assert.match(source,/sendLimitReached/);
 assert.match(source,/\/abonnement\?checkout=pro&interval=month/);
});
test('075: billing CTA goes through existing checked Stripe checkout',()=>{
 const source=read('src/app/(dashboard)/abonnement/page.tsx');
 assert.match(source,/data\?\.tier === 'free'/);
 assert.match(source,/action\('checkout','pro','month'\)/);
 assert.match(source,/disabled=\{busy \|\| !data\.enabled \|\| !data\.plans\.pro\.month\.available\}/);
});
test('075: private admin shows current paid share, not unverified historic conversions',()=>{
 const source=read('src/app/(dashboard)/admin/page.tsx');
 assert.match(source,/Part des comptes Pro\/Business/);
 assert.match(source,/pas un taux historique de conversion/);
 assert.match(source,/data\.totalUsers/);
});
test('075: SQL quota enforcement unchanged',()=>{
 const sql=read('supabase/029_free_limits_074.sql');
 assert.match(sql,/max_monthly_sends = 10/);
 assert.match(sql,/max_active_groups = 2/);
 assert.match(sql,/max_pending_schedules = 3/);
});
