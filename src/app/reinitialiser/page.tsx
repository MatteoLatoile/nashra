'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, CheckCircle2, LoaderCircle, LockKeyhole } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import '../connexion/auth-v081.css';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'checking' | 'ready' | 'invalid' | 'done'>('checking');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void createClient().auth.getUser().then(({ data, error }) => {
      if (active) setStatus(!error && data.user ? 'ready' : 'invalid');
    }).catch(() => { if (active) setStatus('invalid'); });
    return () => { active = false; };
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    if (password.length < 8) return setError('Utilisez au moins 8 caractères.');
    if (password !== confirmation) return setError('Les mots de passe ne correspondent pas.');
    setBusy(true);
    const { error } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(error.message);
    setStatus('done');
    router.refresh();
  }

  return <main className="n8-resetroot"><section className="n8-resetcard">
    <span className="n8-overline">SÉCURITÉ DU COMPTE</span>
    <h1>Modifier votre mot de passe.</h1>
    {status === 'checking' ? <p>Vérification du lien en cours…</p> :
      status === 'invalid' ? <><p>Votre lien a expiré ou n'est pas valide.</p><Link className="n8-submit" href="/connexion">Retour à la connexion <ArrowRight size={18}/></Link></> :
      status === 'done' ? <><p className="n8-reset-success"><CheckCircle2 size={20}/> Mot de passe mis à jour.</p><Link className="n8-submit" href="/">Accéder à mon espace <ArrowRight size={18}/></Link></> :
      <form className="n8-form" onSubmit={e => void submit(e)}>
        <p>Choisissez un nouveau mot de passe pour votre compte Nashra.</p>
        <label htmlFor="reset-password">Nouveau mot de passe</label>
        <div className="n8-input"><LockKeyhole size={18}/><input id="reset-password" type="password" autoComplete="new-password" minLength={8} value={password} onChange={e => setPassword(e.target.value)} required/></div>
        <label htmlFor="reset-confirm">Confirmer le mot de passe</label>
        <div className="n8-input"><LockKeyhole size={18}/><input id="reset-confirm" type="password" autoComplete="new-password" value={confirmation} onChange={e => setConfirmation(e.target.value)} required/></div>
        {error && <p role="alert" className="n8-message bad">{error}</p>}
        <button type="submit" className="n8-submit" disabled={busy}>{busy ? <LoaderCircle className="tg-spin" size={18}/> : <ArrowRight size={18}/>} Enregistrer le nouveau mot de passe</button>
      </form>}
  </section></main>;
}
