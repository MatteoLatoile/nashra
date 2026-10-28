import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';
import AuthForm from './auth-form';
import './auth-v081.css';

export const dynamic = 'force-dynamic';

export default async function ConnexionPage() {
  const configured = isSupabaseConfigured();
  if (configured) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    if (data?.claims?.sub) redirect('/');
  }

  return <main className="n8-root">
    <div className="n8-layout">
      <section className="n8-hero" aria-label="À propos de Nashra">
        <Link href="/connexion" className="n8-brand"><span className="n8-logo"><Image src="/nashra-mark.png" alt="" width={30} height={30} priority /></span> nashra<span className="n8-dot">.</span></Link>
        <div className="n8-hero-content">
          <span className="n8-kicker"><i /> VOTRE ESPACE DE TRAVAIL</span>
          <h2>Votre contenu.<br/><span>Au bon endroit.</span></h2>
          <p>Gérez vos annonces, organisez vos destinations et retrouvez vos campagnes dans un espace pensé pour vous.</p>
          <div className="n8-hero-feature"><span>01</span> Une bibliothèque pour toutes vos annonces</div>
          <div className="n8-hero-feature"><span>02</span> Un calendrier pour vos campagnes</div>
          <div className="n8-hero-feature"><span>03</span> Une interface sobre, claire et rapide</div>
        </div>
        <span className="n8-hero-foot">NASHRA © 2026 · GESTION DES PUBLICATIONS</span>
      </section>

      <section className="n8-authside" aria-label="Connexion à Nashra">
        <div className="n8-authcard">
          <div className="n8-mobile-brand"><Image src="/nashra-mark.png" alt="" width={26} height={26} /> nashra<span>.</span></div>
          <span className="n8-overline">ESPACE PERSONNEL</span>
          <h1>Bienvenue sur Nashra.</h1>
          <p className="n8-intro">Connectez-vous ou créez votre espace en quelques instants.</p>
          {configured ? <AuthForm /> : <div className="n8-message bad">Supabase n'est pas configuré. Renseignez votre fichier .env.local pour activer la connexion.</div>}
        </div>
        <span className="n8-legal">Un seul compte. Vos annonces et campagnes au même endroit.</span>
      </section>
    </div>
  </main>;
}
