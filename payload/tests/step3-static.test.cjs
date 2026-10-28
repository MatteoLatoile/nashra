const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('SQL protects direct JSON workspace updates',()=>{
  const sql=read('supabase/016_quota_guards.sql');
  assert.match(sql,/BEFORE INSERT OR UPDATE OF data ON public\.workspaces/);
  assert.match(sql,/NASHRA_ACTIVE_GROUP_QUOTA_EXCEEDED/);
  assert.match(sql,/auth\.uid\(\)/);
});
test('SQL pending schedules guard service role and client writes',()=>{
  const sql=read('supabase/016_quota_guards.sql');
  assert.match(sql,/BEFORE INSERT OR UPDATE OF status ON public\.delivery_queue/);
  assert.match(sql,/NASHRA_PENDING_SCHEDULE_QUOTA_EXCEEDED/);
  assert.match(sql,/pg_advisory_xact_lock/);
});
test('New-or-existing bookings distinguished before cleanup',()=>{
  const sql=read('supabase/016_quota_guards.sql');
  assert.match(sql,/nashra_reserve_send_with_origin/);
  assert.match(sql,/newly_created/);
});
test('Manual publishing reserves before one Telegram send',()=>{
  const ts=read('src/app/api/telegram/user/publish-announcement/route.ts');
  assert.ok(ts.indexOf('await reserveSend(')<ts.indexOf('await sendWithPersonalAccount('));
  assert.match(ts,/finalizeSend\(c\.userId, reservationId, 'confirmed'\)/);
});
test('Native schedule reserves before Telegram and distinguishes accepted from sent',()=>{
  const ts=read('src/app/api/automation/native-schedule/route.ts');
  assert.ok(ts.indexOf('await reserveSendWithOrigin(')<ts.indexOf('await scheduleWithTelegram('));
  assert.match(ts,/status: 'telegram_scheduled'/);
  assert.doesNotMatch(ts,/status: 'sent'/);
});
test('Worker reserves before calling personal Telegram API',()=>{
  const ts=read('src/lib/automation/worker.ts');
  const segment=ts.slice(ts.indexOf('export async function runOneDelivery()'));
  assert.ok(segment.indexOf('await reserveSend(')<segment.indexOf('await sendWithPersonalAccount('));
});
test('Billing status uses effective plan and real counters, not legacy 100/300/500',()=>{
  const ts=read('src/app/api/billing/status/route.ts');
  assert.match(ts,/getQuotaSnapshot/);
  assert.doesNotMatch(ts,/QUEUE_LIMITS/);
});
test('Usage copy offers the eleven required languages',()=>{
  const ts=read('src/lib/billing/usage-copy.ts');
  for(const lang of ['fr','en','ar','ru','es','it','de','id','fil','tr','ur']) assert.match(ts,new RegExp(`\\b${lang}: \\{`));
});
