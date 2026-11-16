import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { refillRecurringRules } from '@/lib/automation/recurring-service';
import { recordRecurringRun } from '@/lib/nashra-monitor/recurring-telemetry';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET || '';
  const supplied = req.headers.get('authorization') || '';
  const candidate = supplied.startsWith('Bearer ') ? supplied.slice(7) : '';
  const a = Buffer.from(candidate), b = Buffer.from(secret);
  if (secret.length < 32 || a.length !== b.length || !timingSafeEqual(a,b))
    return NextResponse.json({ error:'Non autorisé.' },{status:401});
  if (req.nextUrl.searchParams.get('dry_run') === '1')
    return NextResponse.json({ dry_run:true,enabled:process.env.NASHRA_RECURRING_ENABLED === '1' });
  const startedAt = Date.now();
  if (process.env.NASHRA_RECURRING_ENABLED !== '1' || process.env.NASHRA_DISABLE_ALL_SENDS === '1') {
    await recordRecurringRun({startedAt, outcome:'disabled'});
    return NextResponse.json({state:'disabled'});
  }
  try {
    const result = await refillRecurringRules();
    await recordRecurringRun({startedAt, outcome:'done', result});
    return NextResponse.json({state:'done',...result});
  } catch {
    await recordRecurringRun({startedAt, outcome:'error'});
    return NextResponse.json({error:'Réapprovisionnement impossible : contrôlez les logs serveur et SQL 018.'},{status:500});
  }
}
