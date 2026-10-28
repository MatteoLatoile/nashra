'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, ShieldAlert, CheckCircle2, Clock3 } from 'lucide-react';
import { PageHeader } from '@/components/ui';
import { useLanguage } from '@/lib/i18n/provider';
import { localeForIntl } from '@/lib/i18n';
import { useApp } from '@/lib/store';
import { readiness, type Check } from '@/lib/automation/readiness';

type Report = ReturnType<typeof readiness>;
export default function AutomationReadinessPage() {
  const { locale, t } = useLanguage();
  const { data, cloudMode, ready } = useApp();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  async function refresh() {
    setLoading(true); setError('');
    try {
      if (!cloudMode) { setReport(readiness(data)); return; }
      const response = await fetch('/api/automation/readiness', { credentials: 'same-origin', cache: 'no-store' });
      const json: Report & { error?: string } = await response.json();
      if (!response.ok) throw new Error(json.error || 'Vérification impossible.');
      setReport(json);
    } catch (err) { setError(err instanceof Error ? err.message : 'Erreur inconnue'); }
    finally { setLoading(false); }
  }
  useEffect(() => { if (ready) void refresh(); /* refresh on entry only */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, cloudMode]);
  return <>
    <PageHeader eyebrow="AUTOMATISATION · AUDIT" title="Préparer les publications" description="Contrôle des créneaux et des autorisations avant activation du moteur serveur." actions={<button className="btn btn-secondary" onClick={() => void refresh()} disabled={loading}><RefreshCw size={16}/>{loading ? 'Analyse…' : 'Actualiser'}</button>}/>
    <div className="notice-row notice-dark"><ShieldAlert size={20}/><div><strong>Aucun envoi automatique dans cette version</strong><span>Il s'agit d'un audit en lecture seule. Ni Telegram ni vos groupes ne reçoivent de message. L'autorisation d'une destination doit correspondre à une permission réelle.</span></div></div>
    <div className="n21-actions"><Link href="/campagnes" className="btn btn-secondary"><ArrowLeft size={16}/> Retour aux campagnes</Link><span>{cloudMode ? 'Espace Supabase' : 'Données locales de démonstration'}</span></div>
    {error && <p className="n21-error" role="alert">{error}</p>}
    {report && <>
      <div className="n21-metrics">
        <div><small>Campagnes</small><strong>{report.totals.campaigns}</strong></div>
        <div><small>Prêtes techniquement</small><strong>{report.totals.ready}</strong></div>
        <div><small>À corriger</small><strong>{report.totals.blocked}</strong></div>
        <div><small>Créneaux passés à examiner</small><strong>{report.totals.dueSlots}</strong></div>
      </div>
      {report.campaigns.length === 0 && <div className="n21-card">Aucune campagne créée. Commencez par ajouter une campagne depuis le calendrier.</div>}
      <div className="n21-grid">{report.campaigns.map((c: Check) => <article key={c.id} className="n21-card">
        <div className="n21-cardhead"><h2>{c.name}</h2><span className={c.ready ? 'n21-ok' : 'n21-bad'}>{c.ready ? <CheckCircle2 size={15}/> : <ShieldAlert size={15}/>} {c.ready ? 'Contrôles OK' : 'À corriger'}</span></div>
        <div className="n21-details"><span><Clock3 size={14}/> {c.dates} créneau(x)</span><span>{c.totalDeliveries} publication(s) potentielles</span></div>
        <p className="n21-next">Prochain créneau : {c.nextDate ? new Date(c.nextDate).toLocaleString(localeForIntl(locale)) : 'Aucun à venir'}</p>
        {c.issues.length ? <ul className="n21-issues">{c.issues.map(issue => <li key={issue.code}>{t(issue.message)}</li>)}</ul> : <p className="n21-pass">Les vérifications structurelles sont satisfaites. Les droits Telegram réels restent à confirmer.</p>}
      </article>)}</div>
    </>}
  </>;
}
