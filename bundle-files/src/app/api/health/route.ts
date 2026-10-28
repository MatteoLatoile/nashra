import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export async function GET() {
  return NextResponse.json({ ok: true, service: 'nashra', version: '2.7-ops-bundle' },
    { headers: { 'Cache-Control': 'no-store' } });
}
