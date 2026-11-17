import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/app/api/automation/native-schedule/route.ts', import.meta.url), 'utf8');

test('067: native scheduling requires an updated queue row before confirmation', () => {
  assert.match(src, /const \{ data: confirmedJob, error \} = await service\.from\('delivery_queue'\)\.update\(\{ status: 'telegram_scheduled'/);
  assert.match(src, /\.eq\('status','processing'\)\s*\.select\('id'\)\.maybeSingle\(\)/);
  const guard = src.indexOf('if (error || !confirmedJob) throw new Error(');
  const success = src.indexOf('scheduled++;', guard);
  assert.ok(guard >= 0 && success > guard);
});

test('067: unconfirmed native Telegram result remains uncertain, not safely blocked', () => {
  assert.match(src, /if \(error \|\| !confirmedJob\) throw new Error\(/);
  assert.match(src, /const status = err instanceof DeliveryBlocked \? 'blocked' : 'needs_review'/);
  assert.match(src, /status === 'blocked' \? 'released' : 'uncertain'/);
});

test('067: no added Telegram send, cancel or automatic retry', () => {
  assert.equal((src.match(/await scheduleWithTelegram\(/g) || []).length, 1);
  assert.equal((src.match(/await cancelTelegramSchedule\(/g) || []).length, 1);
  assert.doesNotMatch(src, /retryScheduledMessage|resendOnFailure/);
});
