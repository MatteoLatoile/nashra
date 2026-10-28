'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, RefreshCw, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/ui';
type QueueJob = { id: string; job_key: string; campaign_id: string; announcement_id: string; destination_id: string; scheduled_at: string; method: string; status: string };
export default function QueuePage() {
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/automation/queue', { cache: 'no-store' });
      const data = await res.json() as { jobs?: QueueJob[]; error?: string };
      if (!res.ok) throw new Error(data.error || 'Lecture impossible.');
      setJobs(data.jobs || []);
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Erreur de connexion.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const change = async (action: 'prepare' | 'cancel', jobId?: string) => {
    setBusy(true); setNotice('');
    try {
      const res = await fetch('/api/automation/queue', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, jobId }) });
      const data = await res.json() as { error?: string; prepared?: number };
      if (!res.ok) throw new Error(data.error || 'Action impossible.');
      setNotice(action === 'prepare' ? `${data.prepared ?? 0} opération(s) examinée(s). Aucun message envoyé.` : 'Tâche annulée.');
      await refresh();
    } catch(e) { setNotice(e instanceof Error ? e.message : 'Erreur.'); }
    finally { setBusy(false); }
  };
  return <>
    <PageHeader eyebrow="NASHRA · AUTOMATISATION" title="File d'attente" description="Préparez les opérations en attente de validation, sans envoyer de message Telegram." actions={<button className="btn btn-secondary" disabled={loading} onClick={() => void refresh()}><RefreshCw size={15}/> Actualiser</button>}/>
    <div className="notice-row notice-dark"><ShieldCheck size={20}/><div><strong>Mode sécurisé : aucun envoi automatique</strong><span>Les opérations sont enregistrées au statut « En attente ». Aucun service d'envoi ne les exécutera dans cette version.</span></div></div>
    <div className="n23-toolbar"><Link href="/planification" className="btn btn-secondary"><CalendarClock size={16}/> Voir le planning</Link><button className="btn btn-primary" disabled={busy || loading} onClick={() => void change('prepare')}>{busy ? 'Traitement…' : 'Préparer les créneaux futurs'}</button></div>
    {notice && <p role="status" className="n23-notice">{notice}</p>}
    <div className="n23-metrics"><div><span>En attente</span><strong>{jobs.filter(x => x.status === 'held').length}</strong></div><div><span>Annulées</span><strong>{jobs.filter(x => x.status === 'cancelled').length}</strong></div><div><span>Envois exécutés</span><strong>0</strong></div></div>
    {loading ? <p className="n23-notice">Chargement…</p> : jobs.length ? <div className="n22-table-wrap"><table className="n22-table"><thead><tr><th>Date prévue</th><th>Campagne</th><th>Annonce</th><th>Destination</th><th>Mode</th><th>État</th><th>Action</th></tr></thead><tbody>{jobs.map(j => <tr key={j.id}><td>{new Date(j.scheduled_at).toLocaleString()}</td><td>{j.campaign_id}</td><td>{j.announcement_id}</td><td>{j.destination_id}</td><td>{j.method}</td><td>{j.status === 'held' ? 'En attente' : 'Annulée'}</td><td>{j.status === 'held' && <button className="btn btn-secondary" disabled={busy} onClick={() => void change('cancel',j.id)}>Annuler</button>}</td></tr>)}</tbody></table></div> : <div className="n21-card">Aucune tâche. Préparez un planning futur pour ajouter vos premières opérations.</div>}
  </>;
}
