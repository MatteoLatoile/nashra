'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, LoaderCircle, RefreshCcw, ShieldCheck } from 'lucide-react';

type Result = {
  state: 'waiting' | 'processing' | 'active' | 'needs_attention';
  tier?: 'pro' | 'business';
  interval?: 'month' | 'year';
  currentPeriodEnd?: string | null;
  error?: string;
};

const MAX_AUTOMATIC_CHECKS = 12;

export function CheckoutResultNotice({ sessionId, onActivated }: {
  sessionId: string;
  onActivated: () => void | Promise<void>;
}) {
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [checks, setChecks] = useState(0);
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);

  const check = useCallback(async (signal: AbortSignal) => {
    try {
      const response = await fetch(`/api/billing/checkout-result?session_id=${encodeURIComponent(sessionId)}`, {
        cache: 'no-store', signal,
      });
      const body = await response.json() as Result;
      if (!response.ok) throw new Error(body.error || 'Vérification impossible.');
      if (!signal.aborted) {
        setResult(body);
        setError('');
        if (body.state === 'active') onActivated();
      }
    } catch (e) {
      if (!signal.aborted) setError(e instanceof Error ? e.message : 'Erreur de vérification.');
    } finally {
      if (!signal.aborted) { setChecks(n => n + 1); setLoading(false); }
    }
  }, [sessionId, onActivated]);

  useEffect(() => {
    if (!sessionId) return;
    const controller = new AbortController();
    void check(controller.signal);
    return () => controller.abort();
  }, [sessionId, retry, check]);

  useEffect(() => {
    if (error || !result || result.state === 'active' || result.state === 'needs_attention'
      || checks >= MAX_AUTOMATIC_CHECKS || loading) return;
    const timeout = setTimeout(() => setRetry(n => n + 1), 3000);
    return () => clearTimeout(timeout);
  }, [checks, error, result, loading]);

  const isActive = result?.state === 'active';
  const waiting = !error && !isActive && result?.state !== 'needs_attention' && checks < MAX_AUTOMATIC_CHECKS;
  const offer = result?.tier === 'business' ? 'Business' : result?.tier === 'pro' ? 'Pro' : 'votre offre';

  return <section className="n25-plan" role="status" aria-live="polite" style={{margin:'18px 0',padding:24,border:'1px solid #46414f',borderRadius:16}}>
    <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}>
      {isActive ? <CheckCircle2 size={28} color="#a78bfa" />
        : waiting ? <LoaderCircle size={28} className="animate-spin" />
          : <ShieldCheck size={28} />}
      <h2 style={{margin:0,fontSize:21}}>
        {isActive ? `Bienvenue sur Nashra ${offer} !`
          : result?.state === 'needs_attention' ? 'Votre paiement nécessite une vérification'
          : waiting ? 'Activation de votre abonnement…' : 'Vérification de votre abonnement'}
      </h2>
    </div>
    <p style={{marginBottom:16,lineHeight:1.6}}>
      {isActive
        ? `Votre offre ${offer} est activée. Vos nouvelles limites sont disponibles dans Nashra.`
        : result?.state === 'needs_attention'
          ? 'La souscription ne peut pas être confirmée. Consultez votre espace de facturation ou contactez le support.'
          : error ? error
            : waiting ? 'Nous attendons la confirmation sécurisée de Stripe. Vous pouvez rester sur cette page.'
              : 'La confirmation prend plus de temps que prévu. Votre paiement ne doit pas être recommencé sans vérifier son état.'}
    </p>
    {isActive && result?.currentPeriodEnd && <p style={{marginBottom:15}}>
      Période actuelle jusqu’au {new Date(result.currentPeriodEnd).toLocaleDateString('fr-FR')}.
    </p>}
    <div style={{display:'flex',flexWrap:'wrap',gap:10}}>
      {isActive && <Link href="/dashboard" className="btn btn-primary">Accéder à mon espace</Link>}
      {(!isActive || error) && <button type="button" className="btn btn-secondary" disabled={loading}
        onClick={() => { setResult(null); setError(''); setLoading(true); setChecks(0); setRetry(n => n + 1); }}>
        <RefreshCcw size={16} /> Vérifier à nouveau
      </button>}
      {!isActive && <Link href="/abonnement" className="btn btn-secondary">Voir mon abonnement</Link>}
    </div>
  </section>;
}
