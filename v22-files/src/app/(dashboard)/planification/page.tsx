'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, Download, ShieldAlert, CalendarClock } from 'lucide-react';
import { PageHeader } from '@/components/ui';
import { useApp } from '@/lib/store';
import { makeExecutionPlan, type ExecutionPlan } from '@/lib/automation/plan';

function downloadCSV(plan: ExecutionPlan) {
  const rows = [['Date (UTC)', 'Campagne', 'Annonce', 'Destination', 'Mode', 'Statut'],
    ...plan.deliveries.map(x => [x.scheduledAt, x.campaignName, x.announcementTitle, x.destinationName, x.method, x.state])];
  const escape = (cell: string) => `"${( /^[=+@\-\t\r]/.test(cell) ? "'" : '') + cell.replace(/"/g, '""')}"`;
  const csv = '\uFEFF' + rows.map(row => row.map(escape).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'nashra-planification-apercu.csv';
  anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function PlanificationPage() {
  const { data, cloudMode, ready } = useApp();
  const [plan, setPlan] = useState<ExecutionPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      if (!cloudMode) { setPlan(makeExecutionPlan(data)); return; }
      const res = await fetch('/api/automation/plan', { cache: 'no-store', credentials: 'same-origin' });
      const value = await res.json() as ExecutionPlan & { error?: string };
      if (!res.ok) throw new Error(value.error ?? 'Impossible de préparer le planning.');
      setPlan(value);
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur inconnue.'); }
    finally { setLoading(false); }
  }, [cloudMode, data]);
  useEffect(() => { if (ready) void refresh(); }, [ready, refresh]);
  return <>
    <PageHeader eyebrow="AUTOMATISATION · PLAN D'EXÉCUTION" title="Prévisualisation des envois" description="Visualisez chaque combinaison annonce × destination × créneau avant activation d'un service de publication." actions={<button className="btn btn-secondary" disabled={loading} onClick={() => void refresh()}><RefreshCw size={16}/>{loading ? 'Calcul…' : 'Actualiser'}</button>}/>
    <div className="notice-row notice-dark"><ShieldAlert size={20}/><div><strong>Simulation uniquement : aucun envoi Telegram</strong><span>Ce planning ne constitue pas une file d'attente active. Les créneaux passés ne seront pas exécutés automatiquement. Les droits réels de publication doivent être vérifiés sur Telegram.</span></div></div>
    <div className="n22-actions"><Link className="btn btn-secondary" href="/automatisation"><ArrowLeft size={16}/> Audit V2.1</Link><button className="btn btn-secondary" disabled={!plan?.deliveries.length} onClick={() => { if (plan) downloadCSV(plan); }}><Download size={16}/> Exporter CSV</button><span>{cloudMode ? 'Espace Supabase' : 'Démo locale'}</span></div>
    {error && <p role="alert" className="n21-error">{error}</p>}
    {plan && <>
      <div className="n22-summary"><div><small>Opérations envisagées</small><strong>{plan.total}</strong></div><div><small>Campagnes bloquées</small><strong>{plan.skippedCampaigns}</strong></div><div><small>Lignes de l'aperçu</small><strong>{plan.deliveries.length}</strong></div></div>
      {plan.warnings.map((warning,i) => <p className="n22-warning" key={i}>{warning}</p>)}
      {!plan.deliveries.length ? <div className="n21-card"><CalendarClock size={21}/> Aucune opération prête à afficher. Vérifiez vos annonces, destinations et dates dans les campagnes.</div> :
      <div className="n22-table-wrap"><table className="n22-table"><thead><tr><th>Créneau</th><th>Campagne</th><th>Annonce</th><th>Destination</th><th>Mode</th><th>État</th></tr></thead><tbody>{plan.deliveries.map(job => <tr key={job.key}><td>{new Date(job.scheduledAt).toLocaleString()}</td><td>{job.campaignName}</td><td>{job.announcementTitle}</td><td>{job.destinationName}</td><td>{job.method === 'forward' ? 'Transférer' : 'Republier'}</td><td><span className={job.state === 'overdue' ? 'n22-overdue' : 'n22-upcoming'}>{job.state === 'overdue' ? 'Passé' : 'À venir'}</span></td></tr>)}</tbody></table></div>}
    </>}
  </>;
}
