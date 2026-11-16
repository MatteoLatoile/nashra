import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source = fs.readFileSync('src/components/schedule-verification.tsx', 'utf8');
test('automatic read-only checks are throttled and limited per browser tab', () => {
  assert.match(source, /AUTO_COOLDOWN_MS = 10 \* 60_000/);
  assert.match(source, /MAX_AUTO_CHECKS_PER_WINDOW = 3/);
  assert.match(source, /claimAutomaticCheck\(campaignId, Date\.now\(\)\)/);
  assert.match(source, /document\.hidden/);
});
test('an automatic check only calls the existing read-only verification action', () => {
  assert.match(source, /async function check\(automatic = false\)/);
  assert.match(source, /await request\(\{ action: 'check' \}\)/);
  assert.doesNotMatch(source, /action: 'publish'/);
});
test('manual review remains explicit and future messages cannot be manually resolved', () => {
  assert.match(source, /Date\.now\(\) - Date\.parse\(job\.scheduled_at\) >= 30 \* 60_000/);
  assert.match(source, /await confirm\(/);
  assert.match(source, /mark_not_sent/);
});
