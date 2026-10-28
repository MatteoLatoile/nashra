import 'server-only';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient as createUserClient } from '@/lib/supabase/server';

export async function session() {
  const db = await createUserClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) return null;
  return { db, user };
}
export function adminDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Secret Supabase serveur manquant.');
  return createAdminClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export function adminAllowed(userId: string) {
  return (process.env.NASHRA_ADMIN_USER_IDS || '').split(',').map(x => x.trim()).filter(Boolean).includes(userId);
}
export function sameOrigin(req: Request) {
  const origin = req.headers.get('origin');
  try { return Boolean(origin && new URL(origin).origin === new URL(req.url).origin); }
  catch { return false; }
}
export const noStore = { 'Cache-Control': 'no-store' };
