'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock3, Download, History, RefreshCw, Search } from 'lucide-react';
import { Badge, EmptyState, PageHeader } from '@/components/ui';
import { useApp } from '@/lib/store';

type Delivery = {
  id: string; campaign_id: string; announcement_id: string; destination_id: string;
  scheduled_at: string; status: string; attempted_at: string | null;
  finished_at: string | null; telegram_message_id: number | null; last_error: string | null;
};
const labels: Record<string, string> = {
  held: 'À confirmer', approved: 'Programmée', processing: 'En cours',
  sent: 'Envoyée', needs_review: 'À vérifier', blocked: 'Bloquée', cancelled: 'Annulée',
};
function csvCell(v: unknown) {
  const text = String(v ?? '');
  return `"${(/^\s*[=+@-]/.test(text) ? "'" : '') + text.replace(/"/g, '""')}\"`;
}
export default function HistoryPage() {
  const { data, cloudMode } = useApp();
  const [jobs, setJobs] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const reload = useCallback(async () => {
    try {
      const r = await fetch('/api/automation/queue', { cache: 'no-store' });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || 'Historique inaccessible.');
      setJobs(json.jobs ?? []); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur réseau.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void reload(); const timer = setInterval(() => void reload(), 30_000); return () => clearInterval(timer); }, [reload]);
  const named = useMemo(() => jobs.map(j => ({ ...j,
    announcement: data.announcements.find(a => a.id === j.announcement_id)?.title ?? 'Annonce supprimée',
    destination: data.destinations.find(d => d.id === j.destination_id)?.name ?? 'Groupe supprimé',
    manual: j.campaign_id === 'manual',
  })), [jobs, data.announcements, data.destinations]);
  const filtered = named.filter(j => {
    if (filter === 'sent' && j.status !== 'sent') return false;
    if (filter === 'attention' && !['blocked','needs_review','processing'].includes(j.status)) return false;
    if (filter === 'scheduled' && !['held','approved'].includes(j.status)) return false;
    const search = `${j.announcement} ${j.destination} ${j.status} ${j.last_error ?? ''}`.toLowerCase();
    return search.includes(query.trim().toLowerCase());
  }).sort((a,b) => (b.attempted_at ?? b.scheduled_at).localeCompare(a.attempted_at ?? a.scheduled_at));
  function downloadCsv() {
    const rows = [['Date', 'Type', 'Annonce', 'Destination', 'Statut', 'Message Telegram', 'Erreur'],
      ...filtered.map(j => [j.attempted_at ?? j.scheduled_at, j.manual ? 'Immédiate' : 'Calendrier', j.announcement, j.destination,
        labels[j.status] ?? j.status, j.telegram_message_id ?? '', j.last_error ?? ''])];
    const content = '\ufeff' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'nashra-publications.csv';
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  return <>
    <PageHeader eyebrow="PUBLICATIONS TELEGRAM" title="Historique" description="Résultats réels des publications immédiates et programmées, par groupe."/>
    <div className="section-toolbar"><label className="searchbox"><Search size={16}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Rechercher une annonce ou un groupe…" aria-label="Rechercher"/></label>
      <div className="n40-history-actions"><select value={filter} onChange={e => setFilter(e.target.value)} aria-label="Filtrer par statut"><option value="all">Tous les statuts</option><option value="sent">Envoyées</option><option value="scheduled">Programmées</option><option value="attention">À vérifier</option></select>
        <button type="button" className="btn btn-secondary" onClick={() => void reload()}><RefreshCw size={15}/> Actualiser</button>
        <button type="button" className="btn btn-secondary" disabled={!filtered.length} onClick={downloadCsv}><Download size={15}/> CSV</button></div></div>
    {!cloudMode && <p className="n40-error">Connectez-vous à Nashra pour enregistrer l’historique réel.</p>}
    {error && <p className="n40-error" role="alert">{error}</p>}
    {loading ? <div className="page-loader">Chargement de l’historique…</div> : filtered.length ?
      <div className="table-panel"><div className="table-scroller"><table className="data-table n40-history-table"><thead><tr><th>ANNONCE</th><th>GROUPE</th><th>DATE</th><th>STATUT</th><th>DÉTAIL</th></tr></thead><tbody>{filtered.map(j => <tr key={j.id}>
        <td><strong>{j.announcement}</strong><small>{j.manual ? 'Publication immédiate' : 'Calendrier'}</small></td>
        <td>{j.destination}</td>
        <td><span className="n40-history-date"><Clock3 size={13}/>{new Intl.DateTimeFormat('fr-FR',{ dateStyle:'short',timeStyle:'short' }).format(new Date(j.attempted_at ?? j.scheduled_at))}</span></td>
        <td><Badge tone={j.status === 'sent' ? 'positive' : ['blocked','needs_review'].includes(j.status) ? 'warn' : 'neutral'}>{labels[j.status] ?? j.status}</Badge></td>
        <td>{j.last_error ? <span className="n40-history-reason">{j.last_error}</span> : j.telegram_message_id ? `Message #${j.telegram_message_id}` : '—'}</td>
      </tr>)}</tbody></table></div></div> : <EmptyState icon={<History size={26}/>} title="Aucune publication trouvée" description="Créez votre première annonce et publiez-la ou programmez-la dans le calendrier."/>}
    <p className="n40-footnote">Les tentatives incertaines ne sont jamais renvoyées automatiquement. Ce tableau affiche les 500 opérations les plus récentes ; utilisez les filtres pour les consulter.</p>
  </>;
}
