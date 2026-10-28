'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { BarChart3, RefreshCw, ShieldCheck, ArrowRight } from 'lucide-react';
import { PageHeader } from '@/components/ui';
import { useLanguage } from '@/lib/i18n/provider';

type Limits = { tier: 'free' | 'pro' | 'business'; used: number; limit: number;
  remaining: number; trial: boolean; updatedAt: string | null; note: string };
const displayTier = { free: 'Gratuit', pro: 'Pro', business: 'Business' };

export default function LimitsPage() {
  const { t } = useLanguage();
  const [data, setData] = useState<Limits | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result = await fetch('/api/billing/limits', { cache: 'no-store' });
      const body = await result.json() as Limits & { error?: string };
      if (!result.ok) throw new Error(body.error || 'Lecture impossible.');
      setData(body);
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur réseau.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  const ratio = data ? Math.min(100, Math.round((data.used / Math.max(1, data.limit)) * 100)) : 0;
  return <>
    <PageHeader eyebrow="NASHRA · FACTURATION" title={t('Quotas et utilisation')}
      description={t('Suivez les opérations programmées dans votre espace.')}
      actions={<button className="btn btn-secondary" onClick={() => void reload()} disabled={loading}>
        <RefreshCw size={16} />{t('Actualiser')}</button>} />
    <div className="notice-row notice-dark"><ShieldCheck size={19}/><div>
      <strong>{t('Publication sous contrôle')}</strong>
      <span>{t('Le quota limite les nouvelles opérations en attente. Aucun message n’est envoyé sans approbation et activation du worker.')}</span>
    </div></div>
    {error && <p className="n33-error" role="alert">{error}</p>}
    <div className="n33-grid">
      <section className="n33-panel">
        <div className="n33-heading"><span className="n33-icon"><BarChart3 size={22}/></span>
          <div><small>{t('Forfait en cours')}</small><h2>{loading ? '…' : data ? t(displayTier[data.tier]) : '—'}</h2></div>
          <span className="n33-pill">{t('MODE TEST')}</span></div>
        <p className="n33-muted">{t('Nombre d’opérations actives dans la file d’attente.')}</p>
        <div className="n33-numbers"><strong>{data ? data.used : '—'}</strong><span>/ {data ? data.limit : '—'}</span></div>
        <div className="n33-progress" role="progressbar" aria-valuemin={0}
          aria-valuemax={data?.limit || 100} aria-valuenow={data?.used || 0}
          aria-label={t('Utilisation du quota')}><span style={{ width: `${ratio}%` }} /></div>
        <div className="n33-foot"><span>{t('Opérations utilisées')}</span>
          <strong>{data ? data.remaining : '—'} {t('restantes')}</strong></div>
      </section>
      <section className="n33-panel n33-explain"><h2>{t('Comment fonctionnent les limites ?')}</h2>
        <p>{t('Les tâches approuvées, en attente de validation ou en cours comptent dans le quota. Les tâches terminées ou annulées n’y comptent pas.')}</p>
        <p>{t('Les droits Pro et Business ne sont attribués qu’après un événement Stripe de test vérifié. Sans abonnement reconnu, le forfait Gratuit reste actif.')}</p>
        <Link className="btn btn-secondary" href="/abonnement">{t('Gérer mon abonnement')} <ArrowRight size={15}/></Link>
      </section>
    </div>
  </>;
}
