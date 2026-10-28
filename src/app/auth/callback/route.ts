import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') || '/dashboard';
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? (next === '/' ? '/dashboard' : next) : '/dashboard';
  if (!isSupabaseConfigured() || !code) {
    return NextResponse.redirect(new URL('/connexion?erreur=validation', url.origin));
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  return NextResponse.redirect(new URL(error ? '/connexion?erreur=validation' : safeNext, url.origin));
}
