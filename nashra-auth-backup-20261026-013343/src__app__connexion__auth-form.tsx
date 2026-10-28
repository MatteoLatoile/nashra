'use client';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type Mode = 'login' | 'signup';
export default function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  useEffect(() => { if (new URLSearchParams(window.location.search).has('erreur')) setFeedback('Lien de confirmation invalide ou expirÃ©.'); }, []);
  const [good, setGood] = useState(false);

  async function connectGoogle() {
    if (busy) return;

    setBusy(true);
    setFeedback('');
    setGood(false);

    try {
      const { error } = await createClient().auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) throw error;

    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : 'Connexion Google impossible.'
      );
      setBusy(false);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setFeedback(''); setGood(false);
    try {
      const supabase = createClient();
      const result = mode === 'login'
        ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: `${window.location.origin}/auth/callback` } });
      if (result.error) throw result.error;
      if (mode === 'signup' && !result.data.session) {
        setGood(true); setFeedback('Compte crÃ©Ã©. Consultez votre boÃ®te mail pour confirmer votre adresse.');
      } else {
        router.replace('/'); router.refresh();
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Une erreur est survenue.');
    } finally { setBusy(false); }
  }

  async function forgot() {
    if (!email.trim()) { setFeedback('Entrez votre adresse e-mail avant de demander un lien.'); return; }
    setBusy(true); setFeedback('');
    try {
      const supabase = createClient();
      // OTP : lien magique de connexion, pas un faux formulaire de rÃ©initialisation.
      const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: `${window.location.origin}/auth/callback`, shouldCreateUser: false } });
      if (error) throw error;
      setGood(true); setFeedback('Lien de connexion envoyÃ©, si ce compte existe. Consultez votre boÃ®te mail.');
    } catch (error) { setGood(false); setFeedback(error instanceof Error ? error.message : 'Impossible dâ€™envoyer le lien.'); }
    finally { setBusy(false); }
  }
  return <>
    <button
      type="button"
      className="auth-google-button"
      onClick={() => void connectGoogle()}
      disabled={busy}
    >
      <span className="auth-google-icon" aria-hidden="true">
        G
      </span>

      <span>
        {busy ? 'Connexion en cours…' : 'Continuer avec Google'}
      </span>

      {busy
        ? <LoaderCircle className="tg-spin" size={17}/>
        : <ArrowRight size={17} className="auth-google-arrow"/>
      }
    </button>

    <div className="auth-google-divider">
      <span>ou avec une adresse e-mail</span>
    </div>
    <div className="auth-tabs"><button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setFeedback(''); }}>Connexion</button><button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setFeedback(''); }}>CrÃ©er un compte</button></div>
    <form className="auth-form" onSubmit={submit}>
      <label>Adresse e-mail<div className="auth-field"><Mail size={17}/><input type="email" autoComplete="email" placeholder="vous@exemple.com" value={email} onChange={e => setEmail(e.target.value)} required/></div></label>
      <label>Mot de passe<div className="auth-field"><LockKeyhole size={17}/><input type={visible ? 'text' : 'password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={6} placeholder="Au moins 6 caractÃ¨res" value={password} onChange={e => setPassword(e.target.value)} required/><button aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} title="Afficher / masquer" type="button" onClick={() => setVisible(x => !x)}>{visible ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div></label>
      {feedback && <p className={`auth-feedback ${good ? 'success' : ''}`} role="status">{feedback}</p>}
      <button type="submit" className="auth-submit" disabled={busy}>{busy ? <LoaderCircle className="tg-spin" size={18}/> : <ArrowRight size={19}/>} {mode === 'login' ? 'Se connecter' : 'CrÃ©er mon compte'}</button>
    </form>
    {mode === 'login' && <button type="button" className="auth-forgot" disabled={busy} onClick={() => void forgot()}>Recevoir un lien de connexion par e-mail</button>}
    <div className="auth-secure"><ShieldCheck size={16}/> Authentification sÃ©curisÃ©e par Supabase</div>
  </>;
}

