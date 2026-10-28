'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowDownToLine, CalendarClock, RefreshCw, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { PageHeader } from '@/components/ui';

type Job = { id: string; campaign_id: string; announcement_id: string; destination_id: string;
  scheduled_at: string; method: string; status: string; attempted_at?: string | null;
  finished_at?: string | null; telegram_message_id?: number | null; last_error?: string | null;
  needsAttention: boolean };
type Payload = { jobs?: Job[]; totals?: Record<string, number>; attention?: number; note?: string; error?: string };
const states: Record<string,string> = { held: 'À approuver', approved: 'Approuvée', processing: 'En cours',
  sent: 'Envoyée', blocked: 'Bloquée', needs_review: 'À vérifier', cancelled: 'Annulée' };
function csvCell(value: unknown) {
  const raw = String(value ?? '');
  // Prevent spreadsheet formula injection on CSV open.
  const protectedText = /^[\s\u0000-\u001f]*[=+\-@]/.test(raw) ? "'" + raw : raw;
  return '"' + protectedText.replace(/"/g, '""') + '"';
}
export default function OperationsPage() {
  const [report, setReport] = useState<Payload>({});
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [attentionOnly, setAttentionOnly] = useState(false);
  const refresh = useCallback(async () => {
    setBusy(true); setError('');
    try { const res = await fetch('/api/operations', { cache: 'no-store' });
      const result = await res.json() as Payload;
      if (!res.ok) throw new Error(result.error || 'Chargement impossible.');
      setReport(result);
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur de lecture.'); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const jobs = useMemo(() => (report.jobs || []).filter(j => {
    if (status !== 'all' && j.status !== status) return false;
    if (attentionOnly && !j.needsAttention) return false;
    const text = [j.campaign_id,j.announcement_id,j.destination_id,j.status,j.last_error].join(' ').toLowerCase();
    return text.includes(search.toLowerCase());
  }), [report.jobs, search, status, attentionOnly]);
  function download() {
    const rows = [['Date prévue','Campagne','Annonce','Destination','État','Méthode','ID Telegram','Motif'],
      ...jobs.map(j => [j.scheduled_at,j.campaign_id,j.announcement_id,j.destination_id,j.status,j.method,
        j.telegram_message_id ?? '',j.last_error ?? ''])];
    const csv = '\ufeff' + rows.map(row => row.map(csvCell).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'nashra-operations.csv'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const count = (s: string) => report.totals?.[s] ?? 0;
  return <>
    <PageHeader eyebrow="NASHRA · SUIVI" title="Centre des opérations" description="Suivi des publications et des tâches qui nécessitent votre intervention." actions={<button className="btn btn-secondary" onClick={() => void refresh()} disabled={busy}><RefreshCw size={15}/> Actualiser</button>}/>
    <div className="notice-row notice-dark"><ShieldCheck size={18}/><div><strong>La sécurité avant l'automatisation</strong>
      <span>Les erreurs et envois incertains ne sont jamais relancés automatiquement. Contrôlez le groupe Telegram concerné avant toute décision.</span></div></div>
    <div className="n25-stat-grid">
      <article><span>Envois confirmés</span><strong>{count('sent')}</strong></article>
      <article><span>En attente</span><strong>{count('held') + count('approved')}</strong></article>
      <article><span>À examiner</span><strong>{report.attention ?? 0}</strong></article>
      <article><span>Annulées</span><strong>{count('cancelled')}</strong></article>
    </div>
    <div className="n25-actions"><Link href="/file-attente" className="btn btn-primary"><CalendarClock size={16}/> Gérer la file</Link>
      <Link href="/abonnement" className="btn btn-secondary">Abonnement</Link>
      <Link href="/admin" className="btn btn-secondary">Administration</Link>
    </div>
    <div className="n25-toolbar"><label className="n25-search">Rechercher<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Campagne, destination, erreur…" /></label>
      <label className="n25-select"><SlidersHorizontal size={15}/> État<select value={status} onChange={e => setStatus(e.target.value)}><option value="all">Tous</option>{Object.entries(states).map(([key,label]) => <option value={key} key={key}>{label}</option>)}</select></label>
      <label className="n25-checkbox"><input type="checkbox" checked={attentionOnly} onChange={e => setAttentionOnly(e.target.checked)}/> <AlertTriangle size={14}/> À examiner seulement</label>
      <button type="button" className="btn btn-secondary" onClick={download} disabled={!jobs.length}><ArrowDownToLine size={15}/> Export CSV</button>
    </div>
    {error && <div role="alert" className="n25-error">{error}</div>}
    {busy ? <div className="n25-empty">Chargement des opérations…</div> : jobs.length ?
      <div className="n25-table-scroll"><table className="n25-table"><thead><tr><th>Prévue le</th><th>Campagne / annonce</th><th>Destination</th><th>État</th><th>Détails</th></tr></thead><tbody>
        {jobs.map(j => <tr key={j.id} className={j.needsAttention ? 'n25-needs' : ''}><td>{new Date(j.scheduled_at).toLocaleString('fr-FR')}</td>
          <td><strong>{j.campaign_id}</strong><small>{j.announcement_id}</small></td><td>{j.destination_id}</td>
          <td><span className={'n25-badge n25-' + j.status}>{states[j.status] || j.status}</span>{j.needsAttention && <span className="n25-attention">Vérification nécessaire</span>}</td>
          <td>{j.telegram_message_id ? `Message #${j.telegram_message_id}` : '—'}{j.last_error && <small title={j.last_error}>{j.last_error}</small>}</td></tr>)}
      </tbody></table></div> : <div className="n25-empty">Aucune opération correspondante.</div>}
    <p className="n25-footer">{report.note ?? 'Affichage limité à 500 opérations.'} Les identifiants des campagnes sont affichés tels qu'enregistrés.</p>
  </>;
}
