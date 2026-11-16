import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL(`../${p}`, import.meta.url),'utf8');
const recurring = read('src/app/api/cron/recurring/route.ts');
const admin = read('src/app/api/admin/v35/route.ts');
const ui = read('src/app/(dashboard)/surveillance-systeme/page.tsx');
const log = read('src/lib/nashra-monitor/recurring-telemetry.ts');
const migration = read('supabase/026_recurring_cron_monitor_055.sql');
test('No telemetry for unauthorized or dry run cron requests', () => {
  assert.ok(recurring.indexOf('await recordRecurringRun') > recurring.indexOf("req.nextUrl.searchParams.get('dry_run')"));
  assert.match(recurring,/timingSafeEqual/);
});
test('Recurring telemetry never schedules Telegram messages', () => {
  assert.doesNotMatch(log,/runOneDelivery|refillRecurringRules|sendMessage|sendScheduled|telegram\./);
  assert.match(log,/outcome: args.outcome/);
});
test('Telemetry prunes old data and never retries delivery', () => {
  assert.match(log,/30 \* 86_400_000/);
  assert.match(log,/\.delete\(\)\.lt\('started_at', cutoff\)/);
});
test('Only service role accesses the private recurring log', () => {
  assert.match(migration,/ENABLE ROW LEVEL SECURITY/);
  assert.match(migration,/REVOKE ALL ON TABLE .* FROM PUBLIC, anon, authenticated/);
  assert.match(migration,/TO service_role/);
});
test('Recurring monitoring exposed only through authenticated admin route', () => {
  assert.match(admin,/requireAdmin\(\)/);
  assert.match(admin,/nashra_recurring_cron_runs/);
  assert.match(admin,/recurringAgeHours > 36/);
});
test('Surveillance displays last pass and execution history without triggering Cron', () => {
  assert.match(ui,/Cron récurrent · journal interne/);
  assert.match(ui,/report\.recurring\.history\.map/);
  assert.doesNotMatch(ui,/fetch\(['"`]\/api\/cron/);
});
