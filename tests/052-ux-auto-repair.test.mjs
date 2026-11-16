import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {readFileSync} from 'node:fs';
const page=readFileSync(new URL('../src/app/(dashboard)/campagnes/page.tsx',import.meta.url),'utf8');
const verify=readFileSync(new URL('../src/components/schedule-verification.tsx',import.meta.url),'utf8');
const route=readFileSync(new URL('../src/app/api/automation/recurring/route.ts',import.meta.url),'utf8');
test('Verification details are collapsed, but automation remains active',()=>{
  assert.match(verify,/expanded && <div className="n52-verification-detail"/);
  assert.match(verify,/claimAutomaticCheck\(campaignId, Date\.now\(\)\)/);
  assert.match(verify,/onClick=\{\(\) => void check\(false\)\}/);
});
test('Metadata repair stays paused and never schedules Telegram',()=>{
  assert.match(route,/body\.action === 'repair' \|\| body\.action === 'repair_safe'/);
  assert.match(route,/status:'paused'/);
  const section=route.split("if (body.action === 'repair' || body.action === 'repair_safe') {")[1].split("if (body.action === 'resume')")[0];
  assert.doesNotMatch(section,/fillRecurringRule\(|scheduleOnConnectedTelegram\(/);
  assert.match(section,/Destination Telegram modifiée ou manquante/);
});
test('Automatic repair is one-shot, only for paused mismatch',()=>{
  assert.match(page,/safeRepairAttempts\.current\.has\(c\.id\)/);
  assert.match(page,/isPaused\(c\)/);
  assert.match(page,/action: 'repair_safe'/);
  assert.match(page,/Configuration synchronisée automatiquement/);
});
test('Uncertain sends are not silently resolved',()=>{
  assert.match(verify,/checked\?\.status !== 'scheduled'/);
  assert.match(verify,/await confirm\(/);
  assert.match(page,/state\.attention &&/);
});
