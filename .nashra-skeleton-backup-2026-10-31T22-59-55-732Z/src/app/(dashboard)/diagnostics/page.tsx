'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Activity, ArrowRight, CircleAlert, CircleCheck, CircleHelp, LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/ui';
import { useLanguage } from '@/lib/i18n/provider';
import { localeForIntl } from '@/lib/i18n';

type State = 'ok' | 'warning' | 'error' | 'disabled';
type Check = { key: string; state: State; detail: string; action?: string };
type Result = { generatedAt?: string; checks?: Check[]; campaignStats?: { total: number; ready: number; blocked: number };
  readOnly?: boolean; noWrites?: boolean; noTelegramRequests?: boolean; error?: string };
const labels: Record<string, string> = {
  workspace: 'Espace de travail', campaigns: 'Campagnes', telegram: 'Compte Telegram', queue: 'File de publication',
  queueLimit: 'Limite du rapport', migration: 'Sécurité de la file', subscription: 'Abonnements', worker: 'Moteur serveur',
  publishing: 'Publication automatique', billing: 'Paiements Stripe', storage: 'Stockage des photos',
};
const states: Record<State, string> = { ok: 'Opérationnel', warning: 'À vérifier', error: 'Problème', disabled: 'Désactivé' };
const icons = { ok: CircleCheck, warning: CircleAlert, error: CircleAlert, disabled: CircleHelp };

export default function DiagnosticsPage() {
  const { locale, t } = useLanguage();
  const [data, setData] = useState<Result>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result = await fetch('/api/diagnostics', { cache: 'no-store', credentials: 'same-origin' });
      const json = await result.json() as Result;
      if (!result.ok) throw new Error(json.error || 'Le diagnostic est indisponible.');
      setData(json);
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur de connexion.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const totals = useMemo(() => {
    const list = data.checks || [];
    return {
      ok: list.filter(item => item.state === 'ok').length,
      warning: list.filter(item => item.state === 'warning').length,
      error: list.filter(item => item.state === 'error').length,
      disabled: list.filter(item => item.state === 'disabled').length,
    };
  }, [data.checks]);
  return <>
    <PageHeader eyebrow="NASHRA · SANTÉ TECHNIQUE" title={t('Diagnostic du système')}
      description={t('Vérifiez votre configuration avant de lancer des publications.')}
      actions={<button type="button" className="btn btn-secondary" disabled={loading} onClick={() => void refresh()}>
        <RefreshCw size={16} className={loading ? 'n31-rotate' : ''}/>{t('Actualiser')}</button>}/>
    <div className="n31-callout"><ShieldCheck size={22}/><div><strong>{t('Contrôle sans risque')}</strong>
      <p>{t('Ce diagnostic ne publie rien, ne déclenche aucun paiement et ne modifie aucune donnée.')}</p></div></div>
    {error && <div className="n31-error" role="alert">{error} <button type="button" onClick={() => void refresh()}>{t('Réessayer')}</button></div>}
    <div className="n31-stats" aria-live="polite">
      <article><CircleCheck size={19}/><span>{t('Opérationnel')}</span><strong>{loading ? '–' : totals.ok}</strong></article>
      <article><CircleAlert size={19}/><span>{t('À vérifier')}</span><strong>{loading ? '–' : totals.warning}</strong></article>
      <article><CircleAlert size={19}/><span>{t('Problème')}</span><strong>{loading ? '–' : totals.error}</strong></article>
      <article><CircleHelp size={19}/><span>{t('Désactivé')}</span><strong>{loading ? '–' : totals.disabled}</strong></article>
    </div>
    {loading ? <div className="n31-loading"><Activity size={18} className="n31-rotate"/>{t('Analyse en cours…')}</div> :
      <div className="n31-grid">{(data.checks || []).map(item => {
        const Icon = icons[item.state];
        return <article key={item.key} className={`n31-card n31-${item.state}`}>
          <div className="n31-card-top"><span className="n31-card-icon"><Icon size={18}/></span>
            <span className="n31-badge">{t(states[item.state])}</span></div>
          <h2>{t(labels[item.key] || item.key)}</h2>
          <p>{item.detail}</p>
          {item.action && <Link href={item.action} className="n31-action">{t('Ouvrir le module')} <ArrowRight size={14}/></Link>}
        </article>;
      })}</div>}
    <div className="n31-footer"><LockKeyhole size={16}/><div>
      <strong>{t('Rapport privé')}</strong>
      <p>{t('Seules les données de votre compte sont consultées. Aucun jeton, mot de passe ou contenu Telegram n’est affiché.')}</p>
      {data.generatedAt && <small>{t('Dernier contrôle')} : {new Date(data.generatedAt).toLocaleString(localeForIntl(locale))}</small>}
    </div></div>
  </>;
}
