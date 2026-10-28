import Image from 'next/image';
import Link from 'next/link';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import AuthForm from './auth-form';

export const dynamic = 'force-dynamic';

export default async function ConnexionPage() {
  const configured = isSupabaseConfigured();
  if (configured) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    if (data?.claims?.sub) redirect('/');
  }
  return <div className="auth-root">
    <div className="auth-glow"/>
    <div className="auth-shell">
      <Link href="/" className="auth-brand"><span className="auth-logo"><Image src="/nashra-mark.png" alt="" width={43} height={43}/></span><span>nashra<span className="brand-period">.</span></span></Link>
      <div className="auth-card">
        <div className="auth-eyebrow"><span/> VOTRE ESPACE DE TRAVAIL</div>
        <h1>Bienvenue sur Nashra.</h1>
        <p>Un espace pour organiser vos annonces, groupes et campagnes.</p>
        {configured ? <AuthForm/> : <div className="auth-config-notice"><strong>Supabase nâ€™est pas encore configurÃ©.</strong><br/>Ajoutez les clÃ©s publiques dans <code>.env.local</code>, puis exÃ©cutez le script SQL fourni. En attendant, <Link href="/">ouvrir la dÃ©mo locale â†’</Link></div>}
      </div>
      <div className="auth-footnote">Nashra Â· Gestion de publications responsables</div>
    </div>
  </div>;
}

