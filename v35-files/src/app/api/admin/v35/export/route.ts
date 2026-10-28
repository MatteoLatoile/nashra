import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, csv, safeMessage } from '@/lib/nashra-admin/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Admin-only CSV, bounded to 500 rows; no user IDs or Telegram identifiers. */
export async function GET(req: NextRequest) {
  const access = await requireAdmin();
  if (access.response) return access.response;
  const hours = Number(new URL(req.url).searchParams.get('hours') || 24);
  if (!Number.isInteger(hours) || hours < 1 || hours > 168)
    return NextResponse.json({ error:'Durée non valide.' }, { status:400, headers:{'Cache-Control':'no-store'} });
  try {
    const { data, error } = await access.db!.from('nashra_worker_runs')
      .select('started_at,finished_at,duration_ms,outcome,stalled_flagged,expired_flagged')
      .gte('started_at',new Date(Date.now()-hours*3600_000).toISOString())
      .order('started_at',{ascending:false}).limit(500);
    if (error) throw error;
    const rows = [ ['Début UTC','Fin UTC','Durée (ms)','Résultat','Bloquées à examiner','Créneaux expirés'],
      ...(data || []).map(x => [x.started_at,x.finished_at,x.duration_ms,x.outcome,x.stalled_flagged,x.expired_flagged]) ];
    return new NextResponse(csv(rows), { headers: {
      'Content-Type':'text/csv; charset=utf-8',
      'Content-Disposition':`attachment; filename="nashra-cron-${new Date().toISOString().slice(0,10)}.csv"`,
      'Cache-Control':'private, no-store', 'X-Content-Type-Options':'nosniff',
    }});
  } catch(error) { return safeMessage(error); }
}
