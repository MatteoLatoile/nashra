import { redirect } from 'next/navigation';
import { AppProvider, type AppData } from '@/lib/store';
import { Shell } from '@/components/shell';
import { ConfirmProvider } from '@/components/confirm-dialog';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured()) redirect('/connexion');
  const supabase = await createClient();
  // getUser validates the session server-side and supplies onboarding metadata.
  // Avoid the second auth request previously performed via getClaims().
  const { data: authData, error } = await supabase.auth.getUser();
  const user = authData.user;
  if (error || !user) redirect('/connexion');
  const onboardingStatus = user.user_metadata?.nashra_onboarding_status;
  if (onboardingStatus !== 'completed' && onboardingStatus !== 'skipped') redirect('/bienvenue');
  const userId = user.id;
  const email = user.email || 'Mon compte';
  // Fetch through this authenticated user's Supabase client (RLS), never with
  // the service-role key. Invalid/unavailable data falls back to the existing
  // client-side loading path, which retains its retry/error UX.
  let initialWorkspace: AppData | undefined;
  try {
    const { data: workspaceRow, error: workspaceError } = await supabase
      .from('workspaces').select('data').eq('user_id', userId).maybeSingle();
    if (!workspaceError) {
      const candidate: unknown = workspaceRow?.data ?? {
        announcements: [], destinations: [], campaigns: [], activity: [],
      };
      if (candidate && typeof candidate === 'object' &&
          Array.isArray((candidate as AppData).announcements) &&
          Array.isArray((candidate as AppData).destinations) &&
          Array.isArray((candidate as AppData).campaigns) &&
          Array.isArray((candidate as AppData).activity)) {
        initialWorkspace = candidate as AppData;
      }
    }
  } catch {
    // Do not interrupt login or manufacture success if Supabase is unreachable.
  }
  return <AppProvider key={userId} userId={userId} initialWorkspace={initialWorkspace}><ConfirmProvider><Shell userEmail={email}>{children}</Shell></ConfirmProvider></AppProvider>;
}

