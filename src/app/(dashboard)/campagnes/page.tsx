'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Pause, Play, Plus, Trash2, AlertTriangle, Send } from 'lucide-react';
import { Badge, EmptyState, Modal, PageHeader } from '@/components/ui';
import { useConfirm } from '@/components/confirm-dialog';
import { useApp, type AppData, type Campaign } from '@/lib/store';
import { recurringOccurrences, localClockToISOString } from '@/lib/automation/recurrence';

const pad = (x: number) => String(x).padStart(2, '0');
const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localInput = (d: Date) => `${key(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const formatDate = (v: string) => new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(v));
const datesOf = (c: Campaign, from: number, to: number) => c.recurrence?.mode === 'interval'
  ? recurringOccurrences(c.scheduledAt,c.recurrence,from,to,70)
  : c.scheduledDates?.length ? c.scheduledDates : [c.scheduledAt];
type QueueItem = { campaign_id: string; status: string; scheduled_at: string };

export default function CalendarPage() {
  const { data, cloudMode, syncStatus, acceptServerWorkspace, notify } = useApp();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [announcementId, setAnnouncementId] = useState('');
  const [destIds, setDestIds] = useState<string[]>([]);
  const [date, setDate] = useState(() => localInput(new Date(Date.now() + 24 * 3600_000)));
  const [scheduleType,setScheduleType] = useState<'once' | 'interval'>('once');
  const [intervalDays,setIntervalDays] = useState(2);
  const [timeZone,setTimeZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const [untilDate,setUntilDate] = useState('');
  const [recurringEnabled,setRecurringEnabled] = useState(false);
  const [ruleProblems,setRuleProblems] = useState<Record<string,string>>({});
  const [ruleStates,setRuleStates] = useState<Record<string,string>>({});
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [queue, setQueue] = useState<QueueItem[]>([]);

  useEffect(() => {
    const showRecurrence = () => setScheduleType('interval');
    window.addEventListener('nashra:tour:show-recurrence',showRecurrence);
    return () => window.removeEventListener('nashra:tour:show-recurrence',showRecurrence);
  },[]);
  const candidates = data.destinations.filter(d => d.authorized && /^-?\d{3,30}$/.test(d.handle));
  const isPaused = (c: Campaign) => c.status === 'paused' || ruleStates[c.id] === 'paused';
  const active = data.campaigns.filter(c => !isPaused(c));
  const today = key(new Date());
  const dayCells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    first.setDate(first.getDate() - (first.getDay() + 6) % 7);
    return Array.from({ length: 42 }, (_, i) => new Date(first.getFullYear(), first.getMonth(), first.getDate() + i));
  }, [month]);
  const allEvents = useMemo(() => data.campaigns.flatMap(c => datesOf(c,month.getTime()-8*86_400_000,month.getTime()+52*86_400_000).filter(x => Number.isFinite(Date.parse(x)))
    .map(at => ({ c, at, day: key(new Date(at)) }))), [data.campaigns,month]);

  async function refreshQueue() {
    try {
      const r = await fetch('/api/automation/queue', { cache: 'no-store' });
      if (r.ok) {
        const json = await r.json();
        setQueue((json.jobs ?? []) as QueueItem[]);
      }

      const r2 = await fetch('/api/automation/recurring', { cache:'no-store' });
      if (r2.ok) {
        const info = await r2.json() as {enabled:boolean; rules:{id:string;status:string;last_problem:string|null}[]};
        setRecurringEnabled(info.enabled);
        setRuleStates(Object.fromEntries(info.rules.map(x => [x.id,x.status])));
        setRuleProblems(Object.fromEntries(info.rules.filter(x => x.last_problem).map(x => [x.id,x.last_problem!])));
      }
    } catch { /* Do not claim that automation is active when disconnected. */ }
  }
  useEffect(() => {
    void refreshQueue();
    const timer = window.setInterval(() => { if (!document.hidden) void refreshQueue(); }, 30_000);
    return () => window.clearInterval(timer);
  }, []);
  // A calendar link from an announcement preselects that announcement without
  // creating anything or granting publication permission automatically.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('annonce');
    const ad = data.announcements.find(a => a.id === id);
    if (!ad) return;
    setAnnouncementId(ad.id);
    setName(ad.title);
    setDestIds([]);
    setError('');
    setDate(localInput(new Date(Date.now() + 24 * 3600_000)));
    setScheduleType('once'); setIntervalDays(2); setUntilDate('');
    setOpen(true);
    window.history.replaceState(window.history.state, '', '/campagnes');
  }, [data.announcements]);
  function newSchedule() {
    const defaultAd = data.announcements[0];
    setAnnouncementId(defaultAd?.id ?? '');
    setName(defaultAd?.title ?? '');
    setDestIds([]);
    setError('');
    setDate(localInput(new Date(Date.now() + 24 * 3600_000)));
    setScheduleType('once'); setIntervalDays(2); setUntilDate('');
    setOpen(true);
  }
  async function send(action: 'schedule' | 'pause' | 'resume' | 'delete', campaign?: Campaign) {
    if (!cloudMode || syncStatus !== 'synced') { setError('Attendez la synchronisation cloud avant de programmer.'); return; }
    if (busy) return;
    setBusy(true); setError('');
    try {
      const isRecurringCreation = action === 'schedule' && scheduleType === 'interval';
      const existingRecurring = campaign?.recurrence?.mode === 'interval';
      const campaignPayload = action === 'schedule' ? {
        id: crypto.randomUUID(), name: name.trim() || 'Publication', announcementId,
        announcementIds: [announcementId], destinationIds: destIds, method: 'repost' as const,
        scheduledAt: isRecurringCreation ? localClockToISOString(date,timeZone) : new Date(date).toISOString(),
        scheduledDates: [isRecurringCreation ? localClockToISOString(date,timeZone) : new Date(date).toISOString()],
        recurrence: isRecurringCreation ? {
          mode: 'interval' as const, intervalDays, timeZone, until: untilDate || null,
        } : undefined,
        status: 'scheduled' as const, createdAt: new Date().toISOString(),
      } : undefined;
      const native = action === 'schedule' || (campaign?.nativeTelegram === true && action === 'delete');
      const endpoint = isRecurringCreation || existingRecurring ? '/api/automation/recurring'
        : native ? '/api/automation/native-schedule' : '/api/automation/calendar';
      const mappedAction = isRecurringCreation ? 'create'
        : campaign?.nativeTelegram && action === 'delete' && !existingRecurring ? 'cancel' : action;
      const response = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: mappedAction, campaign: campaignPayload,
          campaignId: campaign?.id, confirmed: true, reviewed: existingRecurring && action === 'resume' }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || 'Programmation impossible.');
      acceptServerWorkspace(result.workspace as AppData);
      setOpen(false);
      await refreshQueue();
      notify(action === 'schedule' ? `${result.scheduled ?? 0} programmation(s) acceptée(s) par Telegram pour le moment.` : 'Calendrier mis à jour.');
      if (result.partial || result.warning) setError(`Attention : ${result.warning || result.error || 'Certaines programmations sont à vérifier.'}`);
      // Telegram performs each pre-scheduled send; recurrent rules need daily server refill.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de programmation.');
      await refreshQueue();
    } finally { setBusy(false); }
  }
  async function actionOn(c: Campaign, action: 'pause' | 'resume' | 'delete') {
    const yes = await confirm({
      title: action === 'delete' ? 'Supprimer cette programmation ?' : action === 'pause' ? 'Mettre en pause ?' : 'Réactiver cette programmation ?',
      description: c.recurrence?.mode === 'interval' && action === 'resume' ? 'Avant de reprendre, vérifiez dans Telegram les envois au statut incertain : Nashra ne les renverra pas automatiquement.' : c.nativeTelegram ? 'Cette action supprime les messages encore programmés dans Telegram. Un message déjà parti ne peut pas être rappelé.' : action === 'resume' ? 'Les créneaux futurs seront de nouveau approuvés. Vérifiez qu’aucun message équivalent n’a été publié.' :
        'Les publications en attente seront annulées. Une publication déjà en cours ne peut pas être rappelée.',
      item: c.name, confirmText: action === 'delete' ? 'Supprimer' : action === 'pause' ? 'Mettre en pause' : 'Réactiver',
      tone: action === 'delete' ? 'danger' : 'warning',
    });
    if (yes) await send(action, c);
  }
  const cloudHint = !cloudMode ? 'Connectez Nashra à Supabase pour programmer.' :
    'Une programmation unique est exécutée par Telegram. Une répétition est préprogrammée plusieurs jours à l’avance et renouvelée par le Cron quotidien ; les messages sont espacés de 90 secondes entre groupes.';

  return <>
    <PageHeader eyebrow="PUBLICATIONS PROGRAMMÉES" title="Calendrier" description="Publiez une annonce dans plusieurs groupes, une seule fois ou tous les N jours à une heure choisie." actions={<button className="btn btn-primary" onClick={newSchedule}><Plus size={16}/> Programmer</button>}/>
    <div className="notice-row notice-dark"><AlertTriangle size={19}/><div><strong>Programmation native et répétitions</strong><span>{cloudHint}</span></div></div>
    {error && <p className="n40-error" role="alert">{error}</p>}
    <div className="n40-layout">
      <section className="n40-calendar" aria-label="Calendrier des publications">
        <div className="n40-month"><strong>{new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(month)}</strong><div>
          <button aria-label="Mois précédent" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth()-1, 1))}><ChevronLeft size={17}/></button>
          <button onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Aujourd’hui</button>
          <button aria-label="Mois suivant" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth()+1, 1))}><ChevronRight size={17}/></button>
        </div></div>
        <div className="n40-days">{['L','M','M','J','V','S','D'].map((w,i) => <span key={i}>{w}</span>)}</div>
        <div className="n40-grid">{dayCells.map(d => {
          const events = allEvents.filter(x => x.day === key(d));
          return <div key={key(d)} className={`n40-day ${d.getMonth() !== month.getMonth() ? 'outside' : ''} ${key(d) === today ? 'today' : ''}`}>
            <span>{d.getDate()}</span>{events.slice(0,2).map(x => <small key={x.c.id+x.at} className={x.c.status === 'paused' ? 'paused' : ''} title={x.c.name}>{x.c.name}</small>)}
            {events.length > 2 && <em>+{events.length - 2}</em>}
          </div>;
        })}</div>
      </section>
      <section className="n40-side" aria-label="Campagnes">
        <div className="n40-side-head"><h2>Vos programmations</h2><Badge>{active.length} active(s)</Badge></div>
        {data.campaigns.length === 0 ? <EmptyState icon={<CalendarDays size={24}/>} title="Aucune programmation" description="Créez une annonce et choisissez une date." action={<button className="btn btn-primary" onClick={newSchedule}>Programmer</button>}/> :
          [...data.campaigns].sort((a,b) => a.scheduledAt.localeCompare(b.scheduledAt)).map(c => {
            const queued = queue.filter(j => j.campaign_id === c.id);
            const approved = queued.filter(x => x.status === 'approved' || x.status === 'telegram_scheduled').length;
            const sent = queued.filter(x => x.status === 'sent').length;
            return <article className="n40-item" key={c.id}>
              <div className="n40-item-head"><strong>{c.name}</strong><Badge tone={isPaused(c) ? 'warn' : 'neutral'}>{isPaused(c) ? 'En pause' : sent ? `${sent} envoyé(s)` : approved ? `${approved} en attente` : 'À vérifier'}</Badge></div>
              <p><Clock3 size={13}/>{formatDate(c.scheduledAt)}{c.recurrence?.mode === 'interval' ? ` · tous les ${c.recurrence.intervalDays} jour(s) à l’heure locale (${c.recurrence.timeZone})` : ''}</p>
              {ruleProblems[c.id] && <p role="status" className="n40-error">{ruleProblems[c.id]}</p>}
              <p><Send size={13}/>{c.destinationIds.length} destination(s)</p>
              <div className="n40-item-actions">
                {(c.recurrence?.mode === 'interval' || !c.nativeTelegram) && <button type="button" disabled={busy} onClick={() => void actionOn(c, isPaused(c) ? 'resume' : 'pause')}>
                  {isPaused(c) ? <Play size={14}/> : <Pause size={14}/>} {isPaused(c) ? 'Reprendre' : 'Pause'}
                </button>}
                <button type="button" disabled={busy} onClick={() => void actionOn(c, 'delete')}><Trash2 size={14}/> Supprimer</button>
              </div>
            </article>;
          })}
      </section>
    </div>
    {open && <Modal title="Programmer une publication" subtitle="Publication automatique aux groupes que vous êtes autorisé à utiliser." onClose={() => !busy && setOpen(false)}>
      <form className="form-stack" onSubmit={e => { e.preventDefault(); void send('schedule'); }}>
        <label className="field-label">Nom de la programmation<input maxLength={90} required value={name} onChange={e => setName(e.target.value)}/></label>
        <label className="field-label">Annonce<select required value={announcementId} onChange={e => { setAnnouncementId(e.target.value); if (!name.trim()) setName(data.announcements.find(a => a.id === e.target.value)?.title ?? ''); }}>
          <option value="">Choisir une annonce</option>{data.announcements.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
        </select></label>
        <label className="field-label">Type de programmation
          <select data-tour="schedule-mode" value={scheduleType} onChange={e => setScheduleType(e.target.value as 'once'|'interval')}>
            <option value="once">Une seule fois</option>
            <option value="interval">Répéter automatiquement</option>
          </select>
        </label>
        {scheduleType === 'interval' && <>
          <label className="field-label">Répéter tous les combien de jours ?
            <select data-tour="schedule-interval" value={intervalDays} onChange={e => setIntervalDays(Number(e.target.value))}>
              {[1,2,3,4,5,7,14,30].map(n => <option key={n} value={n}>Tous les {n} jour{n > 1 ? 's' : ''}</option>)}
            </select>
          </label>
          <label className="field-label">Fuseau horaire (IANA)
            <input value={timeZone} onChange={e => setTimeZone(e.target.value)} data-tour="schedule-timezone" placeholder="Asia/Riyadh" required maxLength={80}/>
          </label>
          <label className="field-label">Date de fin (facultative)
            <input data-tour="schedule-until" type="date" value={untilDate} onChange={e => setUntilDate(e.target.value)} />
          </label>
        </>}
        <label className="field-label">{scheduleType === 'interval' ? 'Première diffusion (jour et heure)' : 'Date et heure'}
          <input type="datetime-local" required value={date} onChange={e => setDate(e.target.value)}/>
        </label>
        <div className="n40-dest"><strong>Groupes autorisés</strong><span>Uniquement ceux reliés à un identifiant Telegram.</span>
          {candidates.length ? candidates.map(d => <label key={d.id}><input type="checkbox" checked={destIds.includes(d.id)} onChange={e => setDestIds(prev => e.target.checked ? [...prev, d.id] : prev.filter(x => x !== d.id))}/>{d.name}</label>) : <p>Ajoutez d’abord un groupe depuis <Link href="/groupes">Destinations</Link>.</p>}
        </div>
        <p className="n40-footnote" data-tour="group-stagger">{scheduleType === 'interval'
          ? `Vous autorisez ${destIds.length} diffusion(s) par occurrence. Le premier groupe démarre à l’heure indiquée ; les suivants à 90 secondes d’intervalle. Nashra prépare les prochains jours sur Telegram et les renouvelle quotidiennement via un Cron serveur. Maximum 10 groupes par règle ; restrictions et quotas toujours applicables.`
          : `Vous autorisez ${destIds.length} publication(s) uniques. Telegram doit accepter chaque programmation. Maximum 5 groupes par action.`}</p>
        {scheduleType === 'interval' && !recurringEnabled && <p className="n40-error" role="status">Le moteur récurrent doit être activé côté serveur (NASHRA_RECURRING_ENABLED=1 et Cron configuré).</p>}
        {error && <p className="n40-error" role="alert">{error}</p>}
        <div className="modal-actions"><button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setOpen(false)}>Annuler</button>
          <button type="submit" className="btn btn-primary" disabled={busy || !announcementId || !destIds.length || destIds.length > (scheduleType === 'interval' ? 10 : 5) || !cloudMode || syncStatus !== 'synced' || (scheduleType === 'interval' && !recurringEnabled)}>
            <CalendarDays size={16}/>{busy ? 'Enregistrement…' : 'Confirmer la programmation'}</button></div>
      </form>
    </Modal>}
  </>;
}
