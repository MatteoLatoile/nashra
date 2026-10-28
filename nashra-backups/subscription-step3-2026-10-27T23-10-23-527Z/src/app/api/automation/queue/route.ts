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
  const { data, error } = await c.db.from('delivery_queue')
    .select('id,job_key,campaign_id,announcement_id,destination_id,scheduled_at,method,status,created_at,attempted_at,finished_at,telegram_message_id,last_error')
    .eq('user_id', c.userId).order('created_at', { ascending: false }).limit(500);
  if (error) return NextResponse.json({ error: 'File inaccessible : appliquez les migrations 004 et 005 dans Supabase.' }, { status: 500, headers });
  return NextResponse.json({ jobs: data ?? [], nativeSchedulingAvailable: true, publishingEnabled: process.env.NASHRA_AUTOMATION_ENABLED === '1' && process.env.NASHRA_PUBLISHING_ENABLED === '1', approvalRequired: true }, { headers });
}
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Origine non autorisée.' }, { status: 403, headers });
  const c = await auth();
  if (!c) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401, headers });
  try {
    const body = await req.json() as { action?: string; jobId?: string };
    if (body.action === 'cancel' || body.action === 'approve') {
      if (!body.jobId || !/^[a-f0-9-]{36}$/i.test(body.jobId)) {
        return NextResponse.json({ error: 'Identifiant de tâche invalide.' }, { status: 400, headers });
      }
      const changingTo = body.action === 'approve' ? 'approved' : 'cancelled';
      let update = c.db.from('delivery_queue').update({ status: changingTo, updated_at: new Date().toISOString() })
        .eq('id', body.jobId).eq('user_id', c.userId);
      if (body.action === 'approve') {
        // Explicit approval only, prior to the scheduled time. No bulk approval.
        update = update.eq('status', 'held').gt('scheduled_at', new Date(Date.now() + 60_000).toISOString());
      } else {
        update = update.in('status', ['held', 'approved']);
      }
      const { data, error } = await update.select('id').maybeSingle();
      if (error) throw error;
      return NextResponse.json({ ok: Boolean(data), message: data ? 'Action enregistrée.' : 'Opération indisponible ou déjà traitée.' }, { headers });
    }
    if (body.action !== 'prepare') return NextResponse.json({ error: 'Action inconnue.' }, { status: 400, headers });
    const { data: workspace, error: readError } = await c.db.from('workspaces').select('data').eq('user_id', c.userId).maybeSingle();
    if (readError) throw readError;
    const plan = makeExecutionPlan(workspace?.data ?? {});
    if (plan.hasMore || plan.total > 100) return NextResponse.json({ error: 'Planning trop volumineux : limitez à 100 opérations.' }, { status: 400, headers });
    const future = plan.deliveries.filter(job => job.state === 'upcoming' && Date.parse(job.scheduledAt) > Date.now() + 60_000);
    if (!future.length) return NextResponse.json({ error: 'Aucun créneau futur prêt (au moins une minute).' }, { status: 400, headers });
    const payload = future.map(job => ({ user_id: c.userId, job_key: job.key, campaign_id: job.campaignId,
      announcement_id: job.announcementId, destination_id: job.destinationId, scheduled_at: job.scheduledAt,
      method: job.method, status: 'held' }));
    const { error } = await c.db.from('delivery_queue').upsert(payload, { onConflict: 'user_id,job_key', ignoreDuplicates: true });
    if (error) throw error;
    return NextResponse.json({ ok: true, prepared: payload.length, approvalRequired: true }, { headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('NASHRA_QUOTA_EXCEEDED'))
      return NextResponse.json({ error: 'Limite du forfait atteinte. Libérez des tâches en attente ou consultez /limites.' }, { status: 409, headers });
    return NextResponse.json({ error: 'Opération impossible. Vérifiez les migrations et les permissions.' }, { status: 500, headers });
  }
}
