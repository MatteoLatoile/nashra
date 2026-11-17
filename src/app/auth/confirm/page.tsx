'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, LoaderCircle, MailCheck, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import '../../connexion/auth-v081.css';

type Flow = 'email' | 'recovery';

type Phase = 'ready' | 'checking' | 'error' | 'success';

export default function ConfirmEmailPage() {
  const router = useRouter();
  const [flow, setFlow] = useState<Flow>('email');
  const [token, setToken] = useState('');
  const [phase, setPhase] = useState<Phase>('checking');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const incomingToken = params.get('token_hash') || '';
    const incomingFlow = params.get('type');
    if (!incomingToken || (incomingFlow !== 'email' && incomingFlow !== 'recovery')) {
      setPhase('error');
      return;
    }
    setToken(incomingToken);
    setFlow(incomingFlow);
    setPhase('ready');
  }, []);

  async function confirm() {
    if (!token || phase !== 'ready') return;
    setPhase('checking');
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.verifyOtp({ token_hash: token, type: flow });
      if (error) throw error;
      setPhase('success');
      // Do not retain a one-use token in the address bar after verification.
      window.history.replaceState(null, '', '/auth/confirm');
      router.replace(flow === 'recovery' ? '/reinitialiser' : '/dashboard');
      router.refresh();
    } catch {
      setPhase('error');
    }
  }

  return (
    <main className="n8-resetroot">
      <section className="n8-resetcard n70-authcard">
        <Link href="/" className="n70-brand" aria-label="Nashra, accueil">nashra<span>.</span></Link>
        <span className="n8-overline">SÉCURITÉ DU COMPTE</span>
        <div className="n70-authicon"><MailCheck size={26} aria-hidden="true" /></div>
        <h1>{flow === 'recovery' ? 'Réinitialiser votre mot de passe.' : 'Confirmer votre adresse e-mail.'}</h1>
        {phase === 'ready' ? (
          <>
            <p>{flow === 'recovery' ? 'Cliquez pour ouvrir votre espace sécurisé et choisir un nouveau mot de passe.' : 'Un dernier clic pour activer votre compte Nashra.'}</p>
            <button className="n8-submit" type="button" onClick={() => void confirm()}>
              {flow === 'recovery' ? 'Continuer' : 'Confirmer mon e-mail'} <ArrowRight size={17} aria-hidden="true" />
            </button>
          </>
        ) : phase === 'checking' ? (
          <p className="n70-authstatus" role="status"><LoaderCircle size={18} className="tg-spin" aria-hidden="true" /> Vérification en cours…</p>
        ) : phase === 'success' ? (
          <p className="n70-authstatus n8-reset-success" role="status"><CheckCircle2 size={18} aria-hidden="true" /> Confirmation réussie. Redirection…</p>
        ) : (
          <>
            <p role="alert">Ce lien est invalide, expiré ou déjà utilisé. Demandez un nouveau lien depuis la connexion.</p>
            <Link href="/connexion" className="n8-submit">Retour à la connexion <ArrowRight size={17} aria-hidden="true" /></Link>
          </>
        )}
        <div className="n70-authtrust"><ShieldCheck size={15} aria-hidden="true" /> Vérification sécurisée · Nashra</div>
      </section>
    </main>
  );
}
