import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { OnboardingFlow } from './onboarding-flow';

export const dynamic = 'force-dynamic';

export default async function BienvenuePage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect('/connexion');

  const metadata = data.user.user_metadata || {};
  const savedStep = Number(metadata.nashra_onboarding_step);
  const step = Number.isInteger(savedStep) && savedStep >= 0 && savedStep <= 3
    ? savedStep : 0;

  return <OnboardingFlow
    initialStep={step}
    initialName={typeof metadata.full_name === 'string' ? metadata.full_name : typeof metadata.name === 'string' ? metadata.name : ''}
    initialCompany={typeof metadata.company_name === 'string' ? metadata.company_name : ''}
    initialEmail={data.user.email || ''}
    userId={data.user.id}
  />;
}
