import { redirect } from 'next/navigation';
import { AppProvider } from '@/lib/store';
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
  return <AppProvider key={userId} userId={userId}><ConfirmProvider><Shell userEmail={email}>{children}</Shell></ConfirmProvider></AppProvider>;
}

