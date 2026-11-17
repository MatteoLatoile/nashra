import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/app/api/automation/native-schedule/route.ts', import.meta.url), 'utf8');

test('066: a missing updated row is treated as uncertain cancellation', () => {
  assert.match(src, /\.eq\('status', 'telegram_scheduled'\)\s*\.select\('id'\)\.maybeSingle\(\)/);
  assert.match(src, /if \(error \|\| !cancelledJob\) throw new DeliveryBlocked/);
});

test('066: a reservation is released only after confirmed SQL transition', () => {
  const check = src.indexOf('if (error || !cancelledJob)');
  const release = src.indexOf("if (booking && booking.status === 'reserved')");
  assert.ok(check !== -1 && release > check);
});

test('066: no additional Telegram publish or scheduling calls', () => {
  assert.equal((src.match(/await scheduleWithTelegram\(/g) || []).length, 1);
  assert.equal((src.match(/await cancelTelegramSchedule\(/g) || []).length, 1);
});
