import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { runOneDelivery } from '@/lib/automation/worker';
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
  try {
    // Strictly one job per invocation. Never leak sessions, chat IDs or tokens.
    const result = await runOneDelivery();
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Worker indisponible. Vérifiez SQL 005 et les secrets serveur.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
