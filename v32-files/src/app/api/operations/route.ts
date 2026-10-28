import { NextResponse } from 'next/server';
import { session, noStore } from '@/lib/nashra-bundle/secure';
import { attentionReason } from '@/lib/automation/attention';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET() {
  try {
    const s = await session();
    if (!s) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401, headers: noStore });
    const { data, error } = await s.db.from('delivery_queue')
      .select('id,job_key,campaign_id,announcement_id,destination_id,scheduled_at,method,status,created_at,updated_at,attempted_at,finished_at,telegram_message_id,last_error')
      .eq('user_id', s.user.id).order('scheduled_at', { ascending: false }).limit(500);
    if (error) return NextResponse.json({ error: 'Appliquez les migrations 004 et 005.' }, { status: 503, headers: noStore });
    // All data is scoped to the authenticated user. 'stalled' is informational only: never auto-retry.
    const now = Date.now();
    const jobs = (data || []).map(j => ({ ...j,
      needsAttention: Boolean(attentionReason(j,now)),
    }));
    const totals: Record<string,number> = {};
    for (const job of jobs) totals[job.status] = (totals[job.status] || 0) + 1;
    return NextResponse.json({ jobs, totals, limit: 500, attention: jobs.filter(j => j.needsAttention).length,
      note: 'Les compteurs portent sur les 500 tâches les plus récentes par date. Aucun renvoi automatique.' }, { headers: noStore });
  } catch { return NextResponse.json({ error: 'Suivi indisponible.' }, { status: 500, headers: noStore }); }
}
