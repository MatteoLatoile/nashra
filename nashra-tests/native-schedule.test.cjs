const test = require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs');
const r=p=>fs.readFileSync(p,'utf8');
test('Manual publication no longer requires cron flag',()=>{
 const s=r('src/app/api/telegram/user/publish-announcement/route.ts');
 assert.match(s,/body\.confirmed !== true/); assert.match(s,/nashra_manual_claim/);
 assert.doesNotMatch(s,/process\.env\.NASHRA_PUBLISHING_ENABLED/);
});
test('Native schedule delegates delivery to Telegram, never cron',()=>{
 const s=r('src/lib/automation/telegram-native.ts');
 assert.match(s,/scheduleDate: schedule/);assert.match(s,/message: work.body, schedule/);
 assert.match(s,/deleteScheduledMessages/);
 const sql=r('supabase/013_telegram_native.sql');assert.match(sql,/telegram_scheduled/);
 const worker=r('src/lib/automation/worker.ts');assert.doesNotMatch(worker,/telegram_scheduled/);
});
test('Schedule requires logged-in user, explicit confirmation, authorized groups, unique request',()=>{
 const s=r('src/app/api/automation/native-schedule/route.ts');
 assert.match(s,/context\(req, true\)/);assert.match(s,/body\.confirmed !== true/);
 assert.match(s,/\.authorized/);assert.match(s,/new Set/);
 assert.match(s,/telegram_scheduled/);assert.match(s,/job_key:/);
});
test('Calendar/History handles native Telegram schedule and preserves profile',()=>{
 assert.match(r('src/app/(dashboard)/campagnes/page.tsx'),/native-schedule/);
 assert.match(r('src/app/(dashboard)/historique/page.tsx'),/Date passée · à vérifier/);
 assert.ok(fs.existsSync('src/app/(dashboard)/profil/page.tsx'));
});
