import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = (p) => readFileSync(new URL('../'+p,import.meta.url),'utf8');
const page = src('src/app/(dashboard)/campagnes/page.tsx');
const verify = src('src/components/schedule-verification.tsx');
const route = src('src/app/api/automation/recurring/route.ts');
const service = src('src/lib/automation/recurring-service.ts');

test('052: attention compact but uncertainty stays visible',()=>{
  assert.match(page,/state\.attention && <div className="n52-compact-warning"/);
  assert.match(page,/state\.attention && <ScheduleVerification/);
  assert.match(page,/<details className="n46-details">/);
  assert.match(verify,/expanded && <div className="n52-verification-detail"/);
});
test('052: check remains read-only and rate limited',()=>{
  const api=src('src/app/api/automation/verify/route.ts');
  assert.match(verify,/MAX_AUTO_CHECKS_PER_WINDOW = 3/);
  assert.match(verify,/AUTO_COOLDOWN_MS = 10 \* 60_000/);
  assert.match(verify,/claimAutomaticCheck\(campaignId, Date\.now\(\)\)/);
  assert.match(api,/GetScheduledHistory/);
  assert.doesNotMatch(api,/client\.sendMessage|sendFile\(|scheduleOnConnectedTelegram\(/);
});
test('052: manual status only after elapsed time and explicit consent',()=>{
  const api=src('src/app/api/automation/verify/route.ts');
  assert.match(verify,/Date\.now\(\) - Date\.parse\(job\.scheduled_at\) >= 30 \* 60_000/);
  assert.match(verify,/await confirm\(/);
  assert.match(api,/confirmed!==true/);
  assert.match(api,/30\*60_000/);
});
test('052: automatic repair is paused, single-attempt and never schedules',()=>{
  assert.match(page,/isPaused\(c\)/);
  assert.match(page,/safeRepairAttempts\.current\.has\(c\.id\)/);
  assert.match(page,/action: 'repair_safe'/);
  const section=route.split("if (body.action === 'repair' || body.action === 'repair_safe') {")[1]?.split("if (body.action === 'resume') {")[0];
  assert.ok(section);
  assert.match(section,/rule.status !== 'paused'/);
  assert.match(section,/original\[destId\] !== dest.handle/);
  assert.match(section,/status:'paused'/);
  assert.doesNotMatch(section,/fillRecurringRule\(|scheduleOnConnectedTelegram\(|cancelTelegramSchedule\(/);
});
test('052: uncertain future jobs block resume even with review confirmation',()=>{
  const resume=route.split("if (body.action === 'resume') {")[1];
  assert.ok(resume);
  assert.ok(resume.indexOf('unsafeFuture') < resume.indexOf('body.reviewed'));
  assert.match(resume,/\['needs_review','processing'\]/);
  assert.match(service,/cancelTelegramSchedule\(session,originalChatId/);
});
test('052: buttons show in-place progress, errors and prevent collisions',()=>{
  assert.match(page,/disabled=\{busy\}/);
  assert.match(page,/runningAction/);
  assert.match(page,/Suppression en cours/);
  assert.match(page,/cardFeedback\?\.id === c\.id/);
  assert.match(page,/aria-live="polite"/);
});
