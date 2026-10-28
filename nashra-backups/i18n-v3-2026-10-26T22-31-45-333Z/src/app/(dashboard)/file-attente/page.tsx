'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, RefreshCw, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/ui';

type QueueJob = {
  id: string; job_key: string; campaign_id: string; announcement_id: string;
  destination_id: string; scheduled_at: string; method: string; status: string;
  attempted_at?: string | null; finished_at?: string | null;
  telegram_message_id?: number | null; last_error?: string | null;
};
const labels: Record<string,string> = {
  held: 'En attente de validation', approved: 'Approuvée', processing: 'Traitement en cours',
  sent: 'Envoyée', needs_review: 'À vérifier (aucune relance)', blocked: 'Bloquée', cancelled: 'Annulée',
};
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
  const change = async (action: 'prepare' | 'cancel' | 'approve', jobId?: string) => {
    setBusy(true); setNotice('');
    try {
      const res = await fetch('/api/automation/queue', { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, jobId }) });
      const data = await res.json() as { error?: string; prepared?: number; ok?: boolean; message?: string };
      if (!res.ok) throw new Error(data.error || 'Action impossible.');
      if (action !== 'prepare' && !data.ok) throw new Error(data.message || 'Action indisponible.');
      setNotice(action === 'prepare' ? `${data.prepared ?? 0} créneau(x) préparé(s). Approuvez chaque envoi volontairement.`
        : action === 'approve' ? 'Envoi approuvé. Il pourra être exécuté à l’heure prévue si le worker est activé.' : 'Tâche annulée.');
      await refresh();
    } catch(e) { setNotice(e instanceof Error ? e.message : 'Erreur.'); }
    finally { setBusy(false); }
  };
  return <>
    <PageHeader eyebrow="NASHRA · AUTOMATISATION" title="File d’attente" description="Contrôlez et validez chaque publication avant son exécution." actions={<button className="btn btn-secondary" disabled={loading} onClick={() => void refresh()}><RefreshCw size={15}/> Actualiser</button>}/>
    <div className="notice-row notice-dark"><ShieldCheck size={20}/><div>
      <strong>Validation obligatoire et envois désactivés par défaut</strong>
      <span>Préparer un créneau n’envoie rien. Vous devez approuver chaque ligne, puis configurer et activer séparément le worker serveur. Nashra respecte les restrictions Telegram ; aucun renvoi automatique en cas d’échec.</span>
    </div></div>
    <div className="n23-toolbar"><Link href="/operations" className="btn btn-secondary">Centre des opérations</Link><Link href="/planification" className="btn btn-secondary"><CalendarClock size={16}/> Voir le planning</Link>
      <button className="btn btn-primary" disabled={busy || loading} onClick={() => void change('prepare')}>{busy ? 'Traitement…' : 'Préparer les créneaux futurs'}</button></div>
    {notice && <p role="status" className="n23-notice">{notice}</p>}
    <div className="n23-metrics"><div><span>À approuver</span><strong>{jobs.filter(x => x.status === 'held').length}</strong></div>
      <div><span>Approuvées</span><strong>{jobs.filter(x => x.status === 'approved').length}</strong></div>
      <div><span>Envoyées</span><strong>{jobs.filter(x => x.status === 'sent').length}</strong></div></div>
    {loading ? <p className="n23-notice">Chargement…</p> : jobs.length ? <div className="n22-table-wrap"><table className="n22-table"><thead><tr>
      <th>Date prévue</th><th>Campagne</th><th>Annonce</th><th>Destination</th><th>Mode</th><th>État</th><th>Action</th>
    </tr></thead><tbody>{jobs.map(j => <tr key={j.id}>
      <td>{new Date(j.scheduled_at).toLocaleString()}</td><td>{j.campaign_id}</td><td>{j.announcement_id}</td>
      <td>{j.destination_id}</td><td>{j.method}</td><td><span className={`n24-state n24-state-${j.status}`}>{labels[j.status] || j.status}</span>
        {j.last_error && <small className="n24-detail">{j.last_error}</small>}{j.telegram_message_id != null && <small className="n24-detail">Message Telegram #{j.telegram_message_id}</small>}</td>
      <td><div className="n24-actions">
        {j.status === 'held' && Date.parse(j.scheduled_at) > Date.now() + 60_000 &&
          <button className="btn btn-primary" disabled={busy} onClick={() => void change('approve', j.id)}>Approuver l’envoi</button>}
        {(j.status === 'held' || j.status === 'approved') && <button className="btn btn-secondary" disabled={busy} onClick={() => void change('cancel',j.id)}>Annuler</button>}
      </div></td>
    </tr>)}</tbody></table></div> : <div className="n21-card">Aucune tâche. Préparez des créneaux futurs pour ajouter des opérations.</div>}
  </>;
}
