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
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) redirect('/connexion');
  // Existing accounts see this guide once; "Skip for now" enables the dashboard.
  const { data: onboardingData, error: onboardingError } = await supabase.auth.getUser();
  if (onboardingError || !onboardingData.user) redirect('/connexion');
  const onboardingStatus = onboardingData.user.user_metadata?.nashra_onboarding_status;
  if (onboardingStatus !== 'completed' && onboardingStatus !== 'skipped') redirect('/bienvenue');
  const userId = data.claims.sub;
  const email = typeof data.claims.email === 'string' ? data.claims.email : 'Mon compte';
  return <AppProvider key={userId} userId={userId}><ConfirmProvider><Shell userEmail={email}>{children}</Shell></ConfirmProvider></AppProvider>;
}

