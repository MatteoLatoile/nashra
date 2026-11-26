/** Cron-driven email dispatcher. No Telegram calls, no UI side effects. */
import 'server-only';
import { createHash } from 'node:crypto';
import { adminDb } from '@/lib/nashra-bundle/secure';
import { notificationsEnabled, queueNotification, renderNotification, sessionFingerprint, type NotificationKind, type NotificationPayload } from './notifications';

type OutboxRow = {
  id:string; user_id:string; kind:NotificationKind; event_key:string; payload:NotificationPayload;
  attempts:number; created_at:string;
};
const rootUrl = () => {
  const site = new URL(process.env.NASHRA_APP_URL || '');
  if (site.protocol !== 'https:' || site.username || site.password || site.search || site.hash) throw new Error('NASHRA_APP_URL must be a public HTTPS origin');
  return site.origin;
};
const apiKey = () => {
  const value = process.env.RESEND_API_KEY || '';
  if (!value.startsWith('re_')) throw new Error('RESEND_API_KEY missing');
  return value;
};
const sender = () => {
  const value = process.env.RESEND_FROM_EMAIL || '';
  if (!/^[^\r\n<>]{1,80} <[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}>$/.test(value)) throw new Error('RESEND_FROM_EMAIL invalid');
  return value;
};
async function mark(row:OutboxRow, status:'sent'|'skipped'|'pending'|'failed', code:string|null = null, delayMs = 0) {
  const {error} = await adminDb().from('nashra_email_notifications').update({
    status, last_error_code:code, claimed_at:null,
    ...(status==='sent'?{sent_at:new Date().toISOString()}:{}),
    ...(status==='pending'?{next_attempt_at:new Date(Date.now()+delayMs).toISOString()}:{}),
  }).eq('id',row.id).eq('status','processing');
  if (error) throw new Error('Notification status update failed');
}
async function stillApplicable(row:OutboxRow):Promise<boolean> {
  const db=adminDb();
  if (row.kind==='campaign_action_needed') {
    if (!row.payload.jobId || !row.payload.campaignId) return false;
    const {data,error}=await db.from('delivery_queue').select('status,scheduled_at').eq('id',row.payload.jobId)
      .eq('user_id',row.user_id).eq('campaign_id',row.payload.campaignId).maybeSingle();
    if(error)throw new Error('Job read failed');
    return !!data && data.status==='needs_review' && Date.parse(data.scheduled_at) <= Date.now()-30*60000;
  }
  if (row.kind==='telegram_reconnect') {
    const {data,error}=await db.from('telegram_accounts').select('session_ciphertext').eq('user_id',row.user_id).maybeSingle();
    if (error) throw new Error('Telegram account read failed');
    return !!data?.session_ciphertext && sessionFingerprint(data.session_ciphertext)===row.payload.sessionFingerprint;
  }
  if (row.kind==='subscription_activated' || row.kind==='payment_failed') {
    const {data,error}=await db.from('nashra_subscriptions').select('status').eq('user_id',row.user_id).maybeSingle();
    if(error) throw new Error('Billing state read failed');
    return row.kind==='subscription_activated'
      ? ['active','trialing'].includes(data?.status || '')
      : ['past_due','unpaid','incomplete'].includes(data?.status || '');
  }
  return true;
}
async function send(row:OutboxRow):Promise<'sent'|'skipped'> {
  if (!await stillApplicable(row)) { await mark(row,'skipped','resolved'); return 'skipped'; }
  const {data,error}=await adminDb().auth.admin.getUserById(row.user_id);
  const recipient = data.user?.email;
  if(error || !recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient) || !data.user?.email_confirmed_at) {
    // An unverified address is not eligible for custom transactional notifications.
    await mark(row,'skipped','unverified_or_missing_email'); return 'skipped';
  }
  const copy=renderNotification(row.kind,row.payload||{},rootUrl());
  const key='nashra-'+createHash('sha256').update(row.event_key).digest('hex');
  const response = await fetch('https://api.resend.com/emails',{
    method:'POST',
    headers:{Authorization:`Bearer ${apiKey()}`,'Content-Type':'application/json','Idempotency-Key':key},
    body:JSON.stringify({from:sender(),to:[recipient],subject:copy.subject,html:copy.html,text:copy.text}),
    cache:'no-store',signal:AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`resend_http_${response.status}`);
  await mark(row,'sent');
  return 'sent';
}

/** Never scan old campaigns: NASHRA_EMAILS_SINCE is an explicit launch cutoff. */
export async function scanActionNeeded():Promise<{scanned:number;queued:number}> {
  if (!notificationsEnabled()) return {scanned:0,queued:0};
  const since=process.env.NASHRA_EMAILS_SINCE || '';
  if (!/^\d{4}-\d\d-\d\dT/.test(since) || !Number.isFinite(Date.parse(since))) return {scanned:0,queued:0};
  const db=adminDb();
  const {data:jobs,error}=await db.from('delivery_queue')
    .select('id,user_id,campaign_id,scheduled_at,status')
    .eq('status','needs_review')
    .gte('scheduled_at',since).lte('scheduled_at',new Date(Date.now()-30*60000).toISOString())
    .order('scheduled_at',{ascending:true}).limit(100);
  if(error)throw new Error('Unable to scan campaign notifications');
  const grouped=new Map<string,{id:string;user_id:string;campaign_id:string;scheduled_at:string;status:string}>();
  for(const job of jobs||[]) {
    if(!job.campaign_id || !job.user_id)continue;
    const key=`${job.user_id}:${job.campaign_id}`;
    if(!grouped.has(key))grouped.set(key,job);
  }
  let queued=0;
  for(const job of grouped.values()) {
    const {data,error:wsError}=await db.from('workspaces').select('data').eq('user_id',job.user_id).maybeSingle();
    if(wsError || !data?.data)continue;
    const campaigns=(data.data as {campaigns?:Array<{id:string;createdAt?:string;name?:string;title?:string}>}).campaigns || [];
    const campaign=campaigns.find(c=>c.id===job.campaign_id);
    // Exclude inherited campaigns created before enabling notifications.
    if(!campaign || !campaign.createdAt || Date.parse(campaign.createdAt)<Date.parse(since))continue;
    const eventKey=`campaign-action:${job.user_id}:${job.campaign_id}:${new Date(job.scheduled_at).toISOString().slice(0,10)}`;
    if(await queueNotification(job.user_id,'campaign_action_needed',eventKey,{
      campaign:String(campaign.name || campaign.title || 'Votre campagne').slice(0,120),
      campaignId:job.campaign_id,jobId:job.id,
    }))queued++;
  }
  return {scanned:jobs?.length||0,queued};
}

export async function dispatchNotifications() {
  if (!notificationsEnabled()) return {state:'disabled',claimed:0,sent:0,skipped:0,failed:0};
  // Verify config before claiming any work so a missing API key never strands rows.
  rootUrl();apiKey();sender();
  const {data,error}=await adminDb().rpc('nashra_claim_email_notifications',{p_limit:8});
  if(error)throw new Error('SQL notification migration missing or claim failed');
  const rows=(data||[]) as OutboxRow[];
  let sent=0,skipped=0,failed=0;
  for(const row of rows) {
    try {const outcome=await send(row);if(outcome==='sent')sent++;else skipped++;}
    catch(e){
      failed++;
      const code=e instanceof Error && /^resend_http_\d+$/.test(e.message)?e.message:'transient_or_database_error';
      const attempts=Number(row.attempts)||1;
      try {await mark(row,attempts>=3?'failed':'pending',code,attempts===1?300000:900000);}
      catch{ /* Worker log excludes customer data. */ }
    }
  }
  return {state:'done',claimed:rows.length,sent,skipped,failed};
}
