import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const core = readFileSync(new URL('../src/lib/telegram-user/core.ts', import.meta.url), 'utf8');
const publish = readFileSync(new URL('../src/app/api/telegram/user/publish-announcement/route.ts', import.meta.url), 'utf8');
const native = readFileSync(new URL('../src/app/api/automation/native-schedule/route.ts', import.meta.url), 'utf8');
test('063: upstream Telegram and Supabase errors do not automatically escape to clients', () => {
  assert.match(core, /userMessages\.some\(pattern => pattern\.test\(message\)\)/);
  assert.doesNotMatch(core, /return message;\s*}\s*\/\*\*/);
});
test('063: direct manual publication hides unexpected server errors without altering the Telegram call', () => {
  assert.match(publish, /err instanceof DeliveryBlocked \? err\.message : 'Envoi indisponible/);
  assert.match(publish, /sendWithPersonalAccount\(account\.session_ciphertext, work, album\)/);
  assert.match(publish, /nashra_manual_claim/);
});
test('063: native scheduling hides unexpected errors and preserves uncertain send recording', () => {
  assert.match(native, /err instanceof DeliveryBlocked \? err\.message : 'Programmation indisponible/);
  assert.match(native, /status = err instanceof DeliveryBlocked \? 'blocked' : 'needs_review'/);
  assert.match(native, /scheduleWithTelegram\(account\.session_ciphertext, task\.work, when, album\)/);
});
