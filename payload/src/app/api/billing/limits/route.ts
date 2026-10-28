import { NextResponse } from 'next/server';
import { noStore, session } from '@/lib/nashra-bundle/secure';
import { getQuotaSnapshot } from '@/lib/billing/quotas-server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const s = await session();
  if (!s) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401, headers: noStore });
  try {
    return NextResponse.json(await getQuotaSnapshot(s.user.id), { headers: noStore });
  } catch {
    return NextResponse.json({ error: 'Quotas indisponibles : appliquez SQL 015 et 016.' },
      { status: 503, headers: noStore });
  }
}
