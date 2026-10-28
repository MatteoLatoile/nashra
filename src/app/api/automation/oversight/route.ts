/** Signed-in, READ-ONLY queue supervision. No sessions/tokens or chat identifiers. */
import { NextResponse } from 'next/server';
import { session, noStore } from '@/lib/nashra-bundle/secure';
import { attentionReason } from '@/lib/automation/attention';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const STATES = ['held','approved','processing','sent','needs_review','blocked','cancelled'] as const;
type QueueItem = { status: string; scheduled_at: string; attempted_at: string | null };
export async function GET() {
  try {
    const s = await session();
    if (!s) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401, headers: noStore });
    const [queueResult, migrationResult] = await Promise.all([
      s.db.from('delivery_queue').select('status,scheduled_at,attempted_at')
        .eq('user_id',s.user.id).order('created_at',{ ascending: false }).limit(500),
      s.db.rpc('nashra_v32_migration_ready'),
    ]);
    if (queueResult.error) return NextResponse.json({ error: 'File indisponible. Vérifiez SQL 004 et 005.' }, { status: 503, headers: noStore });
    const jobs = (queueResult.data || []) as QueueItem[];
    const now = Date.now();
    const counts: Record<string,number> = Object.fromEntries(STATES.map(s => [s, 0]));
    const alerts = { uncertain: 0, blocked: 0, stalled: 0, expired: 0 };
    let nextScheduledAt: string | null = null;
    for (const j of jobs) {
      if (j.status in counts) counts[j.status]++;
      const reason = attentionReason(j, now);
      if (reason) alerts[reason]++;
      if (j.status === 'approved' && Date.parse(j.scheduled_at) > now &&
          (!nextScheduledAt || j.scheduled_at < nextScheduledAt)) nextScheduledAt = j.scheduled_at;
    }
    return NextResponse.json({ generatedAt: new Date(now).toISOString(),
      migrationReady: !migrationResult.error && migrationResult.data === true,
      publishingEnabled: process.env.NASHRA_AUTOMATION_ENABLED === '1' && process.env.NASHRA_PUBLISHING_ENABLED === '1',
      sampleSize: jobs.length, partial: jobs.length === 500,
      counts, alerts, nextScheduledAt, requiresManualReview: alerts.uncertain + alerts.blocked + alerts.stalled + alerts.expired,
      note: 'Lecture seule. Les opérations incertaines ne sont jamais relancées automatiquement.'
    }, { headers: noStore });
  } catch { return NextResponse.json({ error: 'Supervision indisponible.' }, { status: 503, headers: noStore }); }
}
