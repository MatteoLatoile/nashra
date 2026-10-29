'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, CheckCircle2, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, ShieldCheck, UserRound, Building2, AlertCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { BillingFlowLoader } from '@/components/billing-flow-loader';

type Mode = 'login' | 'signup';

function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/invalid login credentials/i.test(message)) return 'Adresse e-mail ou mot de passe incorrect.';
  if (/email not confirmed/i.test(message)) return 'Confirmez votre adresse e-mail avant de vous connecter.';
  if (/already registered/i.test(message)) return 'Cette adresse est déjà utilisée. Essayez de vous connecter.';
  if (/password.*(weak|least|short)/i.test(message)) return 'Choisissez un mot de passe plus robuste.';
  if (/rate limit|too many requests|email rate limit/i.test(message)) return 'Trop de tentatives. Réessayez un peu plus tard.';
  return message || 'Une erreur est survenue. Réessayez.';
}

export default function AuthForm({ next = '/dashboard' }: { next?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [business, setBusiness] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [visible, setVisible] = useState(false);
  const [visibleConfirmation, setVisibleConfirmation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [good, setGood] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [leaving, setLeaving] = useState<'authentication' | 'payment' | null>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('erreur')) {
      setFeedback('Le lien de confirmation est invalide ou a expiré. Réessayez.');
    }
  }, []);

  function changeMode(next: Mode) {
    setMode(next);
    setFeedback('');
    setGood(false);
    setAwaitingConfirmation(false);
    setPassword('');
    setConfirmation('');
  }

  async function connectGoogle() {
    if (busy) return;
    setBusy(true);
    setFeedback('');
    setGood(false);
    setLeaving('authentication');
    try {
      const { error } = await createClient().auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
      });
      if (error) throw error;
      // L'utilisateur est redirigé vers Google par Supabase.
    } catch (error) {
      setFeedback(friendlyError(error));
      setLeaving(null);
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setFeedback('');
    setGood(false);

    if (mode === 'signup') {
      if (name.trim().length < 2) {
        setFeedback('Indiquez votre nom (au moins 2 caractères).');
        return;
      }
      if (password.length < 8) {
        setFeedback('Le mot de passe doit contenir au moins 8 caractères.');
        return;
      }
      if (password !== confirmation) {
        setFeedback('Les deux mots de passe ne correspondent pas.');
        return;
      }
    }

    setBusy(true);
    setLeaving('authentication');
    try {
      const supabase = createClient();
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        setLeaving(next.startsWith('/abonnement?') ? 'payment' : 'authentication');
        router.replace(next);
        router.refresh();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
            data: { full_name: name.trim(), company_name: business.trim() },
          },
        });
        if (error) throw error;
        if (!data.session) {
          setLeaving(null);
          setGood(true);
          setAwaitingConfirmation(true);
          setFeedback('Vérifiez votre boîte e-mail pour confirmer votre adresse et activer votre compte. Pensez aux spams.');
        } else {
          setLeaving(next.startsWith('/abonnement?') ? 'payment' : 'authentication');
          router.replace(next);
          router.refresh();
        }
      }
    } catch (error) {
      setLeaving(null);
      setFeedback(friendlyError(error));
    } finally {
      setBusy(false);
    }
  }

  async function forgotPassword() {
    if (busy) return;
    if (!email.trim()) {
      setFeedback('Saisissez votre adresse e-mail avant de demander un lien de réinitialisation.');
      setGood(false);
      return;
    }
    setBusy(true);
    setFeedback('');
    try {
      const { error } = await createClient().auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?next=/reinitialiser`,
      });
      if (error) throw error;
      setGood(true);
      setFeedback('Si un compte correspond à cette adresse, un lien de réinitialisation vous a été envoyé.');
    } catch (error) {
      setGood(false);
      setFeedback(friendlyError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="n8-auth">
      {leaving && <BillingFlowLoader step={leaving} title={leaving === 'payment' ? 'Connexion réussie, préparation de votre offre…' : 'Connexion sécurisée en cours…'} />}
      <button type="button" className="n8-google" onClick={() => void connectGoogle()} disabled={busy}>
        <span className="n8-google-mark" aria-hidden="true">G</span>
        <span>{busy ? 'Connexion en cours…' : 'Continuer avec Google'}</span>
        <ArrowRight size={17} aria-hidden="true" />
      </button>

      <div className="n8-divider"><span>ou continuer avec une adresse e-mail</span></div>
      <div className="n8-tabs" role="group" aria-label="Choisissez une action">
        <button type="button" className={mode === 'login' ? 'active' : ''} aria-pressed={mode === 'login'} onClick={() => changeMode('login')}>Connexion</button>
        <button type="button" className={mode === 'signup' ? 'active' : ''} aria-pressed={mode === 'signup'} onClick={() => changeMode('signup')}>Créer un compte</button>
      </div>

      {awaitingConfirmation && mode === 'signup' ? (
        <div className="n8-confirmed">
          <div className="n8-confirmed-icon"><Mail size={25} /></div>
          <h3>Un dernier clic et c'est prêt.</h3>
          <p>{feedback}</p>
          <span className="n8-email-recap">{email}</span>
          <button type="button" className="n8-secondary" onClick={() => changeMode('login')}>Retour à la connexion <ArrowRight size={16} /></button>
        </div>
      ) : (
        <form className="n8-form" onSubmit={e => void submit(e)}>
          {mode === 'signup' && (
            <>
              <label htmlFor="n8-name">Nom complet <span className="n8-required">*</span></label>
              <div className="n8-input"><UserRound size={18} /><input id="n8-name" name="name" autoComplete="name" placeholder="Votre nom et prénom" value={name} onChange={e => setName(e.target.value)} maxLength={90} required minLength={2} /></div>
              <label htmlFor="n8-business">Entreprise <span className="n8-optional">(facultatif)</span></label>
              <div className="n8-input"><Building2 size={18} /><input id="n8-business" name="organization" autoComplete="organization" placeholder="Nom de votre activité" value={business} onChange={e => setBusiness(e.target.value)} maxLength={100} /></div>
            </>
          )}
          <label htmlFor="n8-email">Adresse e-mail <span className="n8-required">*</span></label>
          <div className="n8-input"><Mail size={18} /><input id="n8-email" name="email" type="email" autoComplete="email" inputMode="email" spellCheck={false} placeholder="vous@exemple.com" value={email} onChange={e => setEmail(e.target.value)} required /></div>

          <div className="n8-labelrow"><label htmlFor="n8-password">Mot de passe <span className="n8-required">*</span></label>{mode === 'login' && <button type="button" className="n8-link" onClick={() => void forgotPassword()} disabled={busy}>Mot de passe oublié ?</button>}</div>
          <div className="n8-input"><LockKeyhole size={18} /><input id="n8-password" name="password" type={visible ? 'text' : 'password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} placeholder={mode === 'signup' ? '8 caractères minimum' : 'Votre mot de passe'} value={password} onChange={e => setPassword(e.target.value)} minLength={mode === 'signup' ? 8 : undefined} required /><button type="button" aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} onClick={() => setVisible(x => !x)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
          {mode === 'signup' && (
            <>
              <div className="n8-password-hint"><Check size={14} className={password.length >= 8 ? 'valid' : ''} /> 8 caractères minimum</div>
              <label htmlFor="n8-confirm">Confirmer le mot de passe <span className="n8-required">*</span></label>
              <div className="n8-input"><LockKeyhole size={18} /><input id="n8-confirm" name="confirm-password" type={visibleConfirmation ? 'text' : 'password'} autoComplete="new-password" placeholder="Retapez votre mot de passe" value={confirmation} onChange={e => setConfirmation(e.target.value)} required /><button type="button" aria-label={visibleConfirmation ? 'Masquer la confirmation' : 'Afficher la confirmation'} onClick={() => setVisibleConfirmation(x => !x)}>{visibleConfirmation ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
              {confirmation.length > 0 && <div className={`n8-password-hint ${confirmation === password ? 'match' : 'no-match'}`}>{confirmation === password ? 'Les mots de passe correspondent.' : 'Les mots de passe ne correspondent pas encore.'}</div>}
            </>
          )}
          {feedback && <div className={`n8-message ${good ? 'good' : 'bad'}`} role="status">{good ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />}<span>{feedback}</span></div>}
          <button type="submit" className="n8-submit" disabled={busy}>
            {busy ? <LoaderCircle size={18} className="tg-spin" /> : <ArrowRight size={18} />}
            {mode === 'login' ? 'Se connecter' : 'Créer mon espace Nashra'}
          </button>
          {mode === 'signup' && <p className="n8-note">Un e-mail de confirmation peut être nécessaire avant votre première connexion.</p>}
        </form>
      )}
      <div className="n8-secure"><ShieldCheck size={16} /> Connexion sécurisée par Supabase</div>
    </div>
  );
}
