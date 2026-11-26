// Offline source-security and flow tests; does not call Resend, Stripe or Supabase.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
const root=process.cwd();
const get = p => readFileSync(join(root,p),'utf8');
const notifier=get('src/lib/email/notifications.ts');
const dispatch=get('src/lib/email/dispatch.ts');
const webhook=get('src/app/api/billing/webhook/route.ts');
const cron=get('src/app/api/cron/notifications/route.ts');
const sql=get('supabase/migrations/20261126_nashra_notifications.sql');

test('only server-side mail and no API token in payload',()=>{
 assert.match(notifier,/server-only/);assert.match(dispatch,/server-only/);
 assert.match(dispatch,/process\.env\.RESEND_API_KEY/);
 assert.match(dispatch,/Authorization:`Bearer/);
 assert.doesNotMatch(dispatch,/process\.env\.NEXT_PUBLIC_RESEND/);
});
test('authenticated scheduler and safe optional disabled mode',()=>{
 assert.match(cron,/timingSafeEqual/);assert.match(cron,/CRON_SECRET/);
 assert.match(dispatch,/notificationsEnabled\(\)/);assert.match(notifier,/NASHRA_EMAILS_ENABLED/);
});
test('dedupe in PostgreSQL and provider',()=>{
 assert.match(sql,/event_key text NOT NULL UNIQUE/);
 assert.match(sql,/SKIP LOCKED/);
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
 assert.match(dispatch,/Idempotency-Key/);
});
test('payment notifications only after signed Stripe RPC',()=>{
 const i=webhook.indexOf("db.rpc('nashra_apply_subscription_event_v2'");
 assert.ok(i>=0 && webhook.indexOf("queueNotification(uid",i)>i);
 assert.match(webhook,/invoice.payment_failed/);
});
test('no historical campaign alerts or unsafe auto send',()=>{
 assert.match(dispatch,/NASHRA_EMAILS_SINCE/);
 assert.match(dispatch,/campaign\.createdAt/);
 assert.match(dispatch,/data\.status==='needs_review'/);
 assert.doesNotMatch(dispatch,/sendMessage\(|sendFile\(|sendCode\(/);
});
test('verify email addresses via Supabase admin and status',()=>{
 assert.match(dispatch,/auth\.admin\.getUserById/);
 assert.match(dispatch,/email_confirmed_at/);
});
test('trigger only welcome after confirmed account',()=>{
 assert.match(sql,/OLD\.email_confirmed_at IS NULL AND NEW\.email_confirmed_at IS NOT NULL/);
});
test('included cron code and migration exist',()=>{
 assert.ok(existsSync(join(root,'src/app/api/cron/notifications/route.ts')));
 assert.ok(existsSync(join(root,'supabase/migrations/20261126_nashra_notifications.sql')));
});
