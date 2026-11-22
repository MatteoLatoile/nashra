import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
test('078: Telegram phone form has country selector and E.164 preview', () => {
  const page = read('src/app/(dashboard)/telegram/page.tsx');
  assert.match(page, /PHONE_COUNTRIES\.map/);
  assert.match(page, /formatTelegramNumber\(phoneCountry, phone\)/);
  assert.match(page, /formattedPhone/);
  assert.match(page, /autoComplete="tel-national"/);
  assert.match(page, /inputMode="numeric"|inputMode=\{loginStep === 'password' \? 'text' : 'numeric'\}/);
});
test('078: show actual send channel and respect retry countdown', () => {
  const page = read('src/app/(dashboard)/telegram/page.tsx');
  assert.match(page, /result\.via === 'Telegram'/);
  assert.match(page, /result\.via === 'SMS'/);
  assert.match(page, /retrySeconds > 0/);
  assert.match(page, /codeRequestedFor/);
  assert.match(read('src/app/api/telegram/user/start/route.ts'), /last_code_at/);
  assert.match(read('src/app/api/telegram/user/start/route.ts'), /retryAfterSeconds: 90/);
});
test('078: no Telegram publishing endpoints or credentials in change', () => {
  const phone = read('src/lib/telegram-user/phone.ts');
  assert.match(phone, /export function formatTelegramNumber/);
  assert.match(phone, /\^\\\+\[1-9\]/);
  assert.doesNotMatch(phone, /fetch\(|TELEGRAM_API_HASH|SESSION_ENCRYPTION_KEY/);
});
