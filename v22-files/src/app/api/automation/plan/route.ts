import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { makeExecutionPlan } from '@/lib/automation/plan';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
    const { data: row, error } = await supabase.from('workspaces').select('data').eq('user_id', user.id).maybeSingle();
    if (error) return NextResponse.json({ error: 'Impossible de lire les campagnes.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
    return NextResponse.json(makeExecutionPlan(row?.data ?? {}), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Prévisualisation indisponible.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
