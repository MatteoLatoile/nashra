'use client';
import { useMemo, useState } from 'react';
import { History, Clock3, CircleDot, ShieldAlert, Download, Search } from 'lucide-react';
import { Badge, EmptyState, PageHeader } from '@/components/ui';
import { dateFR, timeFR, useApp } from '@/lib/store';

function csvCell(value: string): string {
  // Prevent spreadsheet formula injection when opening exported logs.
  const cleaned = /^[\s]*[=+@-]/.test(value) ? "'" + value : value;
  return `"${cleaned.replace(/"/g, '""')}"`;
}
export default function HistoryPage() {
  const { data, cloudMode, notify } = useApp();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const records = useMemo(() => data.activity.filter(item => {
    if (filter === 'publications' && item.title !== 'Publication Telegram effectuée') return false;
    if (filter === 'changes' && item.title === 'Publication Telegram effectuée') return false;
    return `${item.title} ${item.detail}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [data.activity, query, filter]);
  function exportCsv() {
    if (!records.length) { notify('Aucun événement à exporter.'); return; }
    const lines = [['Date UTC', 'Action', 'Détail'].map(csvCell).join(','),
      ...records.map(a => [a.createdAt, a.title, a.detail].map(csvCell).join(','))];
    const url = URL.createObjectURL(new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'nashra-historique.csv';
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    notify(`${records.length} événement(s) exporté(s).`);
  }
  return <>
    <PageHeader eyebrow="JOURNAL D’ACTIVITÉ · V2.0" title="Historique" description="Recherchez, filtrez et exportez les actions enregistrées dans votre espace Nashra."/>
    <div className="notice-row"><ShieldAlert size={20}/><div><strong>Historique des actions Nashra</strong><span>Seuls les envois manuels effectivement confirmés sont comptabilisés comme publications. Les créneaux du calendrier ne déclenchent aucun envoi.</span></div></div>
    <div className="n20-history-toolbar"><label className="searchbox"><Search size={16}/><input value={query} onChange={e => setQuery(e.target.value)} aria-label="Rechercher dans l’historique" placeholder="Rechercher une action…"/></label>
      <select value={filter} onChange={e => setFilter(e.target.value)} aria-label="Filtrer l’historique"><option value="all">Toutes les actions</option><option value="publications">Publications réelles</option><option value="changes">Autres actions</option></select>
      <button className="btn btn-secondary" type="button" onClick={exportCsv} disabled={!records.length}><Download size={16}/> Exporter CSV</button></div>
    {records.length ? <div className="history-panel"><div className="table-top"><h2>Activité récente <span>{records.length}</span></h2><Badge>{cloudMode ? 'Cloud' : 'Local'}</Badge></div>
      {records.map(a => <div className="history-row" key={a.id}><span className="history-icon"><CircleDot size={17}/></span><div className="history-content"><strong>{a.title}</strong><p>{a.detail}</p></div><span className="history-date"><Clock3 size={14}/>{dateFR(a.createdAt)} · {timeFR(a.createdAt)}</span></div>)}</div>
    : <EmptyState icon={<History size={26}/>} title="Aucune activité trouvée" description="Modifiez les filtres ou réalisez vos premières actions dans Nashra."/>}
  </>;
}
