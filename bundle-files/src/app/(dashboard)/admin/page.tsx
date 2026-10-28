'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/ui';
type Summary = { queue?: Record<string,number>; subscribers?: number; telegramConnections?: number;
  publishingConfigured?: boolean; error?: string };
const statuses: Record<string,string> = { held: 'En attente de validation', approved: 'Approuvées', processing: 'En cours',
  sent: 'Envoyées', needs_review: 'À vérifier', blocked: 'Bloquées', cancelled: 'Annulées' };
export default function AdminPage() {
  const [report, setReport] = useState<Summary>({});
  const [waiting, setWaiting] = useState(true);
  async function refresh() {
    setWaiting(true);
    try { const response = await fetch('/api/admin/summary', { cache: 'no-store' });
      const json = await response.json() as Summary;
      if (!response.ok) throw new Error(json.error || 'Accès impossible.');
      setReport(json);
    } catch (e) { setReport({ error: e instanceof Error ? e.message : 'Erreur.' }); }
    finally { setWaiting(false); }
  }
  useEffect(() => { void refresh(); }, []);
  return <>
    <PageHeader eyebrow="NASHRA · ADMINISTRATION" title="Vue d’ensemble" description="Indicateurs agrégés, sans exposition des données privées des utilisateurs." actions={<button className="btn btn-secondary" disabled={waiting} onClick={() => void refresh()}><RefreshCw size={16}/> Actualiser</button>}/>
    {report.error ? <div role="alert" className="n25-error">{report.error}<p><Link href="/operations">Retour au centre des opérations</Link></p></div> :
      waiting ? <div className="n25-empty">Chargement…</div> : <>
        <div className="notice-row notice-dark"><ShieldCheck size={20}/><div><strong>Administration protégée</strong><span>Accès uniquement aux comptes listés dans NASHRA_ADMIN_USER_IDS. Aucune session Telegram n’est exposée ici.</span></div></div>
        <div className="n25-stat-grid"><article><span>Connexions Telegram</span><strong>{report.telegramConnections ?? 0}</strong></article>
          <article><span>Abonnements actifs / essai</span><strong>{report.subscribers ?? 0}</strong></article>
          <article><span>Envois confirmés</span><strong>{report.queue?.sent ?? 0}</strong></article>
          <article><span>À examiner</span><strong>{(report.queue?.needs_review ?? 0) + (report.queue?.blocked ?? 0)}</strong></article></div>
        <section className="n25-panel"><h2>Automatisation serveur</h2><p>{report.publishingConfigured ? 'Activation serveur détectée (cela ne garantit pas la configuration Cron).' : 'Désactivée par défaut.'}</p>
          <h2>File d’attente — tous utilisateurs</h2><div className="n25-status-grid">{Object.entries(statuses).map(([key,label]) => <div key={key}><span>{label}</span><strong>{report.queue?.[key] ?? 0}</strong></div>)}</div></section>
      </>}
  </>;
}
