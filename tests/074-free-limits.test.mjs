import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
test('074: Free public pricing, FAQ and help agree', () => {
  const landing = read('src/app/page.tsx');
  const help = read('src/app/aide/page.tsx');
  assert.match(landing, /groups: 2, sends: '10', scheduled: 3/);
  assert.match(landing, /jusqu’à 2 groupes actifs, d’effectuer 10 envois par mois et d’avoir 3 programmations/);
  assert.match(help, /Free : 2 groupes, 10 envois\/mois, 3 programmations/);
});
test('074: only free SQL row is updated and previous migrations are preserved', () => {
  const sql = read('supabase/029_free_limits_074.sql');
  assert.match(sql, /WHERE slug = 'free'/);
  assert.match(sql, /max_monthly_sends = 10/);
  assert.match(sql, /max_active_groups = 2/);
  assert.match(sql, /max_pending_schedules = 3/);
  assert.doesNotMatch(sql, /(?:DELETE FROM|DROP TABLE|TRUNCATE)/i);
  assert.match(read('supabase/025_plan_limits_044.sql'), /\('free',\s*1,\s*3,\s*30,\s*5\)/);
});
test('074: billing diagnostic expects 2, 10, 3 for Free only', () => {
  const d=read('src/app/api/diagnostics/route.ts');
  assert.match(d, /free: \[1, 2, 10, 3\]/);
  assert.match(d, /pro: \[1, 30, 1000, 150\]/);
  assert.match(d, /business: \[1, 30, 2000, 300\]/);
});
test('074: existing Pro and Business display values retained', () => {
  const landing=read('src/app/page.tsx');
  assert.match(landing, /groups: 30, sends: '1 000', scheduled: 150/);
  assert.match(landing, /groups: 30, sends: '2 000', scheduled: 300/);
});
test('074: translated Free plan description agrees with revised quotas', () => {
  const cat=JSON.parse(read('src/lib/i18n/catalog.json'));
  const key='Oui. Le forfait Gratuit permet de connecter un compte Telegram, d’utiliser jusqu’à 2 groupes actifs, d’effectuer 10 envois par mois et d’avoir 3 programmations en attente.';
  assert.ok(cat[key]);
  assert.match(cat[key].en, /2 active groups, 10 monthly sends and 3 pending/);
  assert.match(cat[key].ar, /10/);
});
