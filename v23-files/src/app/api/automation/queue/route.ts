import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { makeExecutionPlan } from '@/lib/automation/plan';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
async function auth() {
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) return null;
  return { db, userId: user.id };
}
function sameOrigin(req: NextRequest) {
  const origin = req.headers.get('origin');
  return !!origin && origin === req.nextUrl.origin;
}
export async function GET() {
  const c = await auth();
  if (!c) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401, headers });
  const { data, error } = await c.db.from('delivery_queue').select('id,job_key,campaign_id,announcement_id,destination_id,scheduled_at,method,status,created_at').eq('user_id', c.userId).order('scheduled_at', { ascending: true }).limit(200);
  if (error) return NextResponse.json({ error: 'File inaccessible. Exécutez le SQL 004_delivery_queue.sql.' }, { status: 500, headers });
  return NextResponse.json({ jobs: data ?? [], publishingEnabled: false }, { headers });
}
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Origine non autorisée.' }, { status: 403, headers });
  const c = await auth();
  if (!c) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401, headers });
  try {
    const body = await req.json() as { action?: string; jobId?: string };
    if (body.action === 'cancel') {
      if (!body.jobId || !/^[a-f0-9-]{36}$/i.test(body.jobId)) return NextResponse.json({ error: 'Tâche invalide.' }, { status: 400, headers });
      const { data, error } = await c.db.from('delivery_queue').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', body.jobId).eq('user_id', c.userId).eq('status', 'held').select('id').maybeSingle();
      if (error) throw error;
      return NextResponse.json({ ok: Boolean(data) }, { headers });
    }
    if (body.action !== 'prepare') return NextResponse.json({ error: 'Action inconnue.' }, { status: 400, headers });
    const { data: workspace, error: readError } = await c.db.from('workspaces').select('data').eq('user_id', c.userId).maybeSingle();
    if (readError) throw readError;
    const plan = makeExecutionPlan(workspace?.data ?? {});
    // Never silently queue partial previews or overdue tasks. No Telegram calls here.
    if (plan.hasMore || plan.total > 100) return NextResponse.json({ error: 'Planning trop volumineux : limitez à 100 opérations avant la préparation.' }, { status: 400, headers });
    const future = plan.deliveries.filter(job => job.state === 'upcoming' && Date.parse(job.scheduledAt) > Date.now() + 60_000);
    if (!future.length) return NextResponse.json({ error: 'Aucun créneau futur prêt (au moins 1 minute).' }, { status: 400, headers });
    const payload = future.map(job => ({ user_id: c.userId, job_key: job.key, campaign_id: job.campaignId, announcement_id: job.announcementId, destination_id: job.destinationId, scheduled_at: job.scheduledAt, method: job.method, status: 'held' }));
    // ignoreDuplicates ensures a previously cancelled job is never silently reactivated.
    const { error } = await c.db.from('delivery_queue').upsert(payload, { onConflict: 'user_id,job_key', ignoreDuplicates: true });
    if (error) throw error;
    return NextResponse.json({ ok: true, prepared: payload.length, publishingEnabled: false }, { headers });
  } catch {
    return NextResponse.json({ error: 'Impossible de modifier la file. Vérifiez SQL, compte et permissions.' }, { status: 500, headers });
  }
}
