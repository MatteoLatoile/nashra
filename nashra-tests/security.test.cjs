/** Offline smoke and security invariants. No Telegram or Supabase requests. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const root = process.cwd();
const source = file => fs.readFileSync(path.join(root,file),'utf8');

test('diagnostic API authenticates BEFORE inspecting tables', () => {
  const api = source('src/app/api/diagnostics/route.ts');
  assert.match(api,/db\.auth\.getUser\(\)/);
  assert.match(api,/status: 401/);
  assert.ok(api.indexOf('db.auth.getUser()') < api.indexOf("db.from('workspaces')"));
  assert.match(api,/user\.id/);
});
test('diagnostic never executes Telegram, Stripe or queue mutations', () => {
  const api = source('src/app/api/diagnostics/route.ts');
  assert.doesNotMatch(api,/sendMessage|forwardMessages|\.insert\(|\.update\(|\.delete\(|stripePost|runOneDelivery/);
  assert.match(api,/noWrites: true/);
  assert.match(api,/noTelegramRequests: true/);
});
test('SQL 007 restricts authenticated status changes and leaves service role worker intact', () => {
  const sql = source('supabase/007_queue_guards.sql');
  assert.match(sql,/auth\.role\(\)\s*=\s*'authenticated'/);
  assert.match(sql,/old\.status\s*=\s*'held'\s+and\s+new\.status\s*=\s*'approved'/);
  assert.match(sql,/old\.scheduled_at\s*>\s*now\(\)\s*\+\s*interval '1 minute'/);
  assert.match(sql,/new\.status\s*=\s*'cancelled'/);
  assert.match(sql,/auth\.role\(\)\s*=\s*'service_role'/);
  assert.match(sql,/grant update \(status, updated_at\) on public\.delivery_queue to authenticated/);
});
test('cron stays protected and publishing remains opt-in', () => {
  const cron = source('src/app/api/cron/nashra/route.ts');
  const worker = source('src/lib/automation/worker.ts');
  assert.match(cron,/timingSafeEqual/);
  assert.match(cron,/secret\.length < 32/);
  assert.match(worker,/NASHRA_AUTOMATION_ENABLED/);
  assert.match(worker,/NASHRA_PUBLISHING_ENABLED/);
  assert.match(worker,/needs_review/);
});
test('diagnostic does not display sensitive session ciphertext or server secrets', () => {
  const api = source('src/app/api/diagnostics/route.ts');
  assert.match(api,/Boolean\(telegramRes\.value\.data\?\.session_ciphertext\)/);
  assert.doesNotMatch(api,/JSON\.stringify\(process\.env\)|\.session_ciphertext\s*[,}]/);
});
