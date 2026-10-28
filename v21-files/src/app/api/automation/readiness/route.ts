import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { readiness } from '@/lib/automation/readiness';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
    const { data, error } = await supabase.from('workspaces').select('data').eq('user_id', user.id).maybeSingle();
    if (error) return NextResponse.json({ error: 'Lecture de votre espace impossible.' }, { status: 500 });
    return NextResponse.json(readiness(data?.data ?? {}), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Vérification momentanément indisponible.' }, { status: 500 });
  }
}
