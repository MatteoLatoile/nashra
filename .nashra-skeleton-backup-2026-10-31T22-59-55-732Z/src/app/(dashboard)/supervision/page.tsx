'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, AlertTriangle, CalendarClock, CheckCircle2, CirclePause, RefreshCw, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/ui';
import { useLanguage } from '@/lib/i18n/provider';
import { localeForIntl } from '@/lib/i18n';

type Oversight = {
  generatedAt: string; migrationReady: boolean; publishingEnabled: boolean;
  sampleSize: number; partial: boolean; counts: Record<string,number>;
  alerts: { uncertain: number; blocked: number; stalled: number; expired: number };
  requiresManualReview: number; nextScheduledAt: string | null; note: string;
};

export default function SupervisionPage() {
  const { t, locale } = useLanguage();
  const [data,setData] = useState<Oversight | null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/automation/oversight', { cache:'no-store' });
      const result = await response.json() as Oversight & { error?: string };
      if (!response.ok) throw new Error(result.error || 'Supervision indisponible.');
      setData(result);
    } catch (err) { setError(err instanceof Error ? err.message : 'Erreur de connexion.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const timestamp = (value: string | null) => value ? new Date(value).toLocaleString(localeForIntl(locale)) : t('Aucun créneau programmé');
  return <>
    <PageHeader eyebrow="NASHRA · SÉCURITÉ" title={t('Supervision')} description={t('Surveillez les opérations en attente et les envois nécessitant une vérification manuelle.')} actions={
      <button className="btn btn-secondary" type="button" disabled={loading} onClick={() => void refresh()}><RefreshCw size={15}/>{t('Actualiser')}</button>
    }/>
    <div className="notice-row notice-dark"><ShieldCheck size={19}/><div><strong>{t('Aucun renvoi automatique après une erreur')}</strong>
      <span>{t('Les envois incertains sont placés en vérification manuelle. Consultez Telegram avant toute nouvelle action.')}</span></div></div>
    {error && <div className="n25-error" role="alert">{error}</div>}
    {loading && !data ? <div className="n25-empty">{t('Chargement…')}</div> : data && <>
      <div className="n32-stat-grid">
        <article><div><CheckCircle2 size={17}/>{t('Envois confirmés')}</div><strong>{data.counts.sent ?? 0}</strong></article>
        <article><div><CalendarClock size={17}/>{t('En attente de validation')}</div><strong>{(data.counts.held ?? 0) + (data.counts.approved ?? 0)}</strong></article>
        <article className={data.requiresManualReview ? 'n32-critical' : ''}><div><AlertTriangle size={17}/>{t('À vérifier manuellement')}</div><strong>{data.requiresManualReview}</strong></article>
        <article><div><CirclePause size={17}/>{t('En traitement')}</div><strong>{data.counts.processing ?? 0}</strong></article>
      </div>
      <div className="n32-panel-grid">
        <section className="n32-panel"><div className="n32-panel-title"><Activity size={20}/><h2>{t('État du moteur')}</h2></div>
          <div className="n32-info"><span>{t('Migration de fiabilité SQL 008')}</span><strong className={data.migrationReady ? 'n32-good' : 'n32-warning'}>{t(data.migrationReady ? 'Installée' : 'À installer')}</strong></div>
          <div className="n32-info"><span>{t('Publication automatique')}</span><strong className={data.publishingEnabled ? 'n32-warning' : 'n32-good'}>{t(data.publishingEnabled ? 'Activée côté serveur' : 'Désactivée')}</strong></div>
          <div className="n32-info"><span>{t('Prochain créneau approuvé')}</span><strong>{timestamp(data.nextScheduledAt)}</strong></div>
          <p className="n32-subtle">{t('Ces contrôles ne testent pas une connexion réelle à Telegram ni la configuration du Cron.')}</p>
        </section>
        <section className="n32-panel"><div className="n32-panel-title"><AlertTriangle size={20}/><h2>{t('Opérations à examiner')}</h2></div>
          <div className="n32-info"><span>{t('Envoi incertain')}</span><strong>{data.alerts.uncertain}</strong></div>
          <div className="n32-info"><span>{t('Opération bloquée')}</span><strong>{data.alerts.blocked}</strong></div>
          <div className="n32-info"><span>{t('Traitement interrompu')}</span><strong>{data.alerts.stalled}</strong></div>
          <div className="n32-info"><span>{t('Créneau expiré')}</span><strong>{data.alerts.expired}</strong></div>
          <p className="n32-subtle">{t('Aucune opération problématique ne sera relancée sans votre intervention.')}</p>
        </section>
      </div>
      {data.partial && <p className="n32-limit">{t('Résultats partiels : affichage limité aux 500 opérations les plus récentes.')}</p>}
      <div className="n32-actions"><Link href="/operations" className="btn btn-primary">{t('Examiner les opérations')}</Link>
        <Link href="/file-attente" className="btn btn-secondary">{t('Ouvrir la file d’attente')}</Link>
        <Link href="/diagnostics" className="btn btn-secondary">{t('Voir les diagnostics')}</Link>
      </div>
    </>}
  </>;
}
