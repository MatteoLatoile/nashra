import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { runOneDelivery } from '@/lib/automation/worker';
import { recordWorkerRun } from '@/lib/nashra-monitor/telemetry';
import { reconcileQueue } from '@/lib/automation/reconcile';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET || '';
  const supplied = req.headers.get('authorization') || '';
  if (secret.length < 32 || !supplied.startsWith('Bearer ')) return false;
  const a = Buffer.from(supplied.slice(7));
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Non autorisé.' }, { status: 401,
    headers: { 'Cache-Control': 'no-store' } });
  // Safe authenticated probe: no claim, no reconciliation, no Telegram call.
  if (request.nextUrl.searchParams.get('dry_run') === '1') {
    return NextResponse.json({
      state: 'dry_run',
      publishing_enabled: process.env.NASHRA_PUBLISHING_ENABLED === '1',
      automation_enabled: process.env.NASHRA_AUTOMATION_ENABLED === '1',
    }, { headers: { 'Cache-Control': 'no-store' } });
  }
  const startedAt = Date.now();
  // A disabled scheduler must never claim or alter a delivery job.
  if (process.env.NASHRA_AUTOMATION_ENABLED !== '1' || process.env.NASHRA_PUBLISHING_ENABLED !== '1') {
    await recordWorkerRun({ state: 'disabled', startedAt });
    return NextResponse.json({ state: 'disabled' }, { headers: { 'Cache-Control': 'no-store' } });
  }
  try {
    // Strictly one job per invocation. Never leak sessions, chat IDs or tokens.
    const reconciliation = await reconcileQueue();
    const result = await runOneDelivery();
    await recordWorkerRun({ state: result.state, startedAt, reconciliation });
    return NextResponse.json({ ...result, reconciliation }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    await recordWorkerRun({ state: 'error', startedAt });
    return NextResponse.json({ error: 'Worker indisponible. Vérifiez SQL 005, SQL 008 et les secrets serveur.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
