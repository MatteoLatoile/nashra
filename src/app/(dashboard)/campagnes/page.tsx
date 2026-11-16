'use client';
import { campaignFailure, queueNotices, readable, type Tone } from '@/lib/feedback';
import { SearchableSelect, SearchableMultiSelect } from '@/components/searchable-select';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Pause, Play, Plus, Trash2, AlertTriangle, Send, LoaderCircle } from 'lucide-react';
import { Badge, EmptyState, Modal, PageHeader } from '@/components/ui';
import { useConfirm } from '@/components/confirm-dialog';
import { useApp, type AppData, type Campaign } from '@/lib/store';
import { recurringOccurrences, localClockToISOString } from '@/lib/automation/recurrence';
import { scheduleView } from '@/lib/automation/schedule-display';
import { ScheduleVerification } from '@/components/schedule-verification';

const pad = (x: number) => String(x).padStart(2, '0');
const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localInput = (d: Date) => `${key(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const formatDate = (v: string) => new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(v));
const datesOf = (c: Campaign, from: number, to: number) => c.recurrence?.mode === 'interval'
  ? recurringOccurrences(c.scheduledAt,c.recurrence,from,to,70)
  : c.scheduledDates?.length ? c.scheduledDates : [c.scheduledAt];
type QueueItem = { id: string; campaign_id: string; destination_id: string; status: string; scheduled_at: string; last_error?: string | null; telegram_message_id?: number | null; telegram_scheduled_ids?: number[] | null; attempted_at?: string | null };

export default function CalendarPage() {
  const { data, cloudMode, syncStatus, acceptServerWorkspace, notify } = useApp();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [announcementId, setAnnouncementId] = useState('');
  const [destIds, setDestIds] = useState<string[]>([]);
  const [date, setDate] = useState(() => localInput(new Date(Date.now() + 10 * 60_000)));
  const [scheduleType,setScheduleType] = useState<'once' | 'interval'>('once');
  const [intervalDays,setIntervalDays] = useState(2);
  const [timeZone,setTimeZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const [untilDate,setUntilDate] = useState('');
  const [recurringEnabled,setRecurringEnabled] = useState(false);
  const [ruleProblems,setRuleProblems] = useState<Record<string,string>>({});
  const [ruleStates,setRuleStates] = useState<Record<string,string>>({});
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [busy, setBusy] = useState(false);
  const [runningAction, setRunningAction] = useState<{ id: string; action: 'pause' | 'resume' | 'delete' | 'repair' } | null>(null);
  // Show errors and confirmations beside the campaign, not only at the top of the page.
  const [cardFeedback, setCardFeedback] = useState<{ id: string; kind: Tone; text: string } | null>(null);
  // NASHRA_040_SCHEDULE_PROGRESS — délai réel, verrou de double soumission.
  const [scheduleElapsed, setScheduleElapsed] = useState(0);
  const submitLock = useRef(false);
  const safeRepairAttempts = useRef(new Set<string>());
  const [autoRepairingId, setAutoRepairingId] = useState<string | null>(null);
  const [severity, setSeverity] = useState<Tone>('warning');
  const [error, setError] = useState('');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [statusInitialized, setStatusInitialized] = useState(false);

  useEffect(() => {
    if (!busy || !open) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setScheduleElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [busy, open]);

  useEffect(() => {
    const showRecurrence = () => setScheduleType('interval');
    window.addEventListener('nashra:tour:show-recurrence',showRecurrence);
    return () => window.removeEventListener('nashra:tour:show-recurrence',showRecurrence);
  },[]);
  const candidates = data.destinations.filter(d => d.authorized && /^-?\d{3,30}$/.test(d.handle));
  const isPaused = (c: Campaign) => c.status === 'paused' || ruleStates[c.id] === 'paused';
  const queueByCampaign = useMemo(() => {
    const groups = new Map<string, QueueItem[]>();
    for (const job of queue) {
      const jobs = groups.get(job.campaign_id) ?? [];
      jobs.push(job);
      groups.set(job.campaign_id, jobs);
    }
    return groups;
  }, [queue]);
  const destinationNames = useMemo(() => Object.fromEntries(data.destinations.map(d => [d.id,d.name])), [data.destinations]);
  const today = key(new Date());
  const dayCells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    first.setDate(first.getDate() - (first.getDay() + 6) % 7);
    return Array.from({ length: 42 }, (_, i) => new Date(first.getFullYear(), first.getMonth(), first.getDate() + i));
  }, [month]);
  const allEvents = useMemo(() => data.campaigns.flatMap(c => datesOf(c,month.getTime()-8*86_400_000,month.getTime()+52*86_400_000).filter(x => Number.isFinite(Date.parse(x)))
    .map(at => ({ c, at, day: key(new Date(at)) }))), [data.campaigns,month]);
  const eventsByDay = useMemo(() => {
    const grouped = new Map<string, typeof allEvents>();
    for (const event of allEvents) grouped.set(event.day, [...(grouped.get(event.day) ?? []), event]);
    return grouped;
  }, [allEvents]);

  async function refreshQueue() {
    try {
      const [r, r2] = await Promise.all([
        fetch('/api/automation/queue', { cache: 'no-store' }),
        fetch('/api/automation/recurring', { cache: 'no-store' }),
      ]);
      if (!r.ok || !r2.ok) throw new Error('Diagnostic des programmations indisponible.');
      const [json, info] = await Promise.all([
        r.json() as Promise<{jobs?:QueueItem[]}>,
        r2.json() as Promise<{enabled:boolean; rules:{id:string;status:string;last_problem:string|null}[]}>,
      ]);
      setQueue(Array.isArray(json.jobs) ? json.jobs : []);
      setRecurringEnabled(info.enabled === true);
      setRuleStates(Object.fromEntries((info.rules ?? []).map(x => [x.id,x.status])));
      setRuleProblems(Object.fromEntries((info.rules ?? []).filter(x => x.last_problem).map(x => [x.id,x.last_problem!])));
      setStatusLoaded(true);
      setStatusInitialized(true);
    } catch {
      // Never show an optimistic green state when Telegram/Supabase cannot be checked.
      setStatusLoaded(false);
      setStatusInitialized(true);
    }
  }
  useEffect(() => {
    void refreshQueue();
    const timer = window.setInterval(() => { if (!document.hidden) void refreshQueue(); }, 30_000);
    return () => window.clearInterval(timer);
  }, []);
  // Repair only an already paused rule with safe, server-validated metadata.
  // No Telegram scheduling, no automatic resume. A failed attempt is never retried
  // in a loop during the same visit.
  useEffect(() => {
    if (!statusLoaded || !cloudMode || syncStatus !== 'synced' || busy || document.hidden) return;
    const candidate = data.campaigns.find(c =>
      c.recurrence?.mode === 'interval' && isPaused(c) &&
      /Règle modifiée|désynchronis|absente de l.espace de travail/i.test(ruleProblems[c.id] ?? '') &&
      !safeRepairAttempts.current.has(c.id));
    if (!candidate) return;
    safeRepairAttempts.current.add(candidate.id);
    setAutoRepairingId(candidate.id);
    void (async () => {
      try {
        const response = await fetch('/api/automation/recurring', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({action: 'repair_safe', campaignId: candidate.id}),
        });
        const result = await response.json();
        if (!response.ok || !result?.ok) throw new Error(result?.error || 'Réparation automatique impossible.');
        acceptServerWorkspace(result.workspace as AppData);
        await refreshQueue();
        setCardFeedback({id:candidate.id, kind:'info',text:'Configuration synchronisée automatiquement. La programmation reste en pause.'});
      } catch {
        // Keep the original pause and detailed manual repair path. No retries.
      } finally {
        setAutoRepairingId(current => current === candidate.id ? null : current);
      }
    })();
    // One repair attempt per rule and page visit; failures remain paused.
    // The candidate is selected from the latest loaded workspace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusLoaded, cloudMode, syncStatus, busy, ruleProblems, ruleStates, data.campaigns]);
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
    setDate(localInput(new Date(Date.now() + 10 * 60_000)));
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
    setDate(localInput(new Date(Date.now() + 10 * 60_000)));
    setScheduleType('once'); setIntervalDays(2); setUntilDate('');
    setOpen(true);
  }
  async function send(action: 'schedule' | 'pause' | 'resume' | 'delete', campaign?: Campaign, reviewedInTelegram = false) {
    setSeverity('warning');
    if (!cloudMode || syncStatus !== 'synced') {
      const text = 'Reprise impossible pour le moment : la synchronisation Supabase n’est pas terminée. Vérifie ta connexion puis réessaie.';
      if (campaign) setCardFeedback({ id: campaign.id, kind: 'warning', text });
      else setError('Attendez la synchronisation cloud avant de programmer.');
      return;
    }
    if (busy || submitLock.current) return;
    if (action === 'schedule' && scheduleType === 'once' && (!Number.isFinite(Date.parse(date)) || Date.parse(date) <= Date.now() + 180_000)) {
      setError('Choisissez une date et une heure futures (au moins 3 minutes). Vérifiez aussi le jour affiché.');
      return;
    }
    if (action === 'schedule') {
      submitLock.current = true;
      setScheduleElapsed(0);
    }
    setBusy(true); setError('');
    if (campaign) setCardFeedback(null);
    setRunningAction(campaign && action !== 'schedule' ? { id: campaign.id, action } : null);
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
          campaignId: campaign?.id, confirmed: true, reviewed: existingRecurring && action === 'resume' && reviewedInTelegram }),
      });
      const result = await response.json();
      if (!result || typeof result.ok !== 'boolean') throw new SyntaxError('Unexpected end of JSON');
      if (!response.ok || !result.ok) throw new Error(result.error || 'Programmation impossible.');
      acceptServerWorkspace(result.workspace as AppData);
      setOpen(false);
      await refreshQueue();
      if (result.partial || result.warning) {
        const text = readable(result.warning || result.error, 'Certaines programmations restent à vérifier dans Telegram.');
        if (campaign) setCardFeedback({ id: campaign.id, kind: 'warning', text });
        else { setSeverity('warning'); setError(text); }
      } else if (action === 'schedule' && result.scheduled > 0) {
        notify(`${result.scheduled} programmation(s) acceptée(s) par Telegram.`);
      } else {
        if (campaign && action !== 'delete') setCardFeedback({
          id: campaign.id,
          kind: 'success',
          text: action === 'resume' ? 'Reprise acceptée par Nashra. Contrôle les prochains créneaux dans Telegram.'
            : 'Pause enregistrée. Les messages futurs déjà préparés ont été traités sans erreur signalée.',
        });
        notify(readable(result.message, 'Calendrier mis à jour.'), action === 'schedule' ? 'info' : 'success');
      }
      // Telegram performs each pre-scheduled send; recurrent rules need daily server refill.
    } catch (err) {
      const notice = campaignFailure(err);
      if (campaign) setCardFeedback({ id: campaign.id, kind: notice.tone, text: notice.text });
      else { setSeverity(notice.tone); setError(notice.text); }
      await refreshQueue();
    } finally {
      submitLock.current = false;
      setBusy(false);
      setRunningAction(null);
    }
  }
  async function repairRule(c: Campaign) {
    if (busy) return;
    const yes = await confirm({
      title:'Resynchroniser cette règle ?',
      description:'Nashra restaurera la configuration initiale depuis la règle serveur, sans programmer ni envoyer de message. La règle restera en pause. Vérifiez toujours les messages futurs incertains dans Telegram.',
      item:c.name, confirmText:'Réparer sans publier', tone:'warning',
    });
    if (!yes) return;
    if (!cloudMode || syncStatus !== 'synced') {
      setCardFeedback({id:c.id, kind:'warning', text:'Synchronisation cloud indisponible. Réessayez après le chargement.'});
      return;
    }
    setBusy(true); setRunningAction({id:c.id,action:'repair'}); setCardFeedback(null);
    try {
      const response = await fetch('/api/automation/recurring', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'repair',campaignId:c.id,confirmed:true}),
      });
      const result = await response.json();
      if (!response.ok || !result?.ok) throw new Error(result?.error || 'Réparation impossible.');
      acceptServerWorkspace(result.workspace as AppData);
      await refreshQueue();
      setCardFeedback({id:c.id,kind:'warning',text:result.warning || 'Règle resynchronisée. Vérifiez Telegram avant de reprendre.'});
    } catch(err) {
      const notice = campaignFailure(err);
      setCardFeedback({id:c.id,kind:notice.tone,text:notice.text});
    } finally { setBusy(false); setRunningAction(null); }
  }
  async function actionOn(c: Campaign, action: 'pause' | 'resume' | 'delete') {
    if (busy) return;
    const jobs = queueByCampaign.get(c.id) ?? [];
    const needsReview = action === 'resume' && jobs.some(j => j.status === 'needs_review');
    const futureUncertain = action === 'resume' && jobs.some(j =>
      (j.status === 'needs_review' || j.status === 'processing') && Date.parse(j.scheduled_at) > Date.now());
    setCardFeedback({ id: c.id, kind: 'info', text: 'Confirme ou annule cette action dans la fenêtre de confirmation.' });
    const yes = await confirm({
      title: action === 'delete' ? 'Supprimer cette programmation ?' : action === 'pause' ? 'Mettre en pause ?' :
        needsReview ? 'Avez-vous vérifié les messages dans Telegram ?' : 'Réactiver cette programmation ?',
      description: futureUncertain
        ? 'Attention : au moins un envoi FUTUR a un statut incertain. Vérifiez dans Telegram qu’aucun message n’est encore programmé pour ce créneau et annulez-le si nécessaire AVANT de reprendre. Une reprise sans contrôle peut provoquer un doublon.'
        : needsReview
          ? 'Certains envois passés restent incertains. Vérifiez le groupe et les messages programmés dans Telegram avant de confirmer. Nashra ne reprogrammera pas les envois passés.'
          : c.nativeTelegram && action !== 'resume'
            ? 'Nashra tentera d’annuler les messages futurs déjà enregistrés sur Telegram. Si l’annulation n’est pas confirmée, la programmation restera visible avec une alerte. Un message déjà parti ne peut pas être rappelé.'
            : action === 'resume' ? 'Nashra préparera les prochains créneaux. Les envois passés ne seront pas renvoyés automatiquement.'
              : 'Les publications en attente seront annulées. Une publication déjà en cours ne peut pas être rappelée.',
      item: c.name,
      confirmText: needsReview ? 'J’ai vérifié, reprendre' : action === 'delete' ? 'Supprimer' : action === 'pause' ? 'Mettre en pause' : 'Reprendre',
      tone: action === 'delete' ? 'danger' : 'warning',
    });
    if (yes) await send(action, c, needsReview);
    else setCardFeedback(prev => prev?.id === c.id ? null : prev);
  }
  const cloudHint = !cloudMode ? 'Connectez Nashra à Supabase pour programmer.' :
    'Une programmation unique est exécutée par Telegram. Une répétition est préprogrammée plusieurs jours à l’avance et renouvelée par le Cron quotidien ; les messages sont espacés de 90 secondes entre groupes.';

  return <>
    <PageHeader eyebrow="PUBLICATIONS PROGRAMMÉES" title="Calendrier" description="Publiez une annonce dans plusieurs groupes, une seule fois ou tous les N jours à une heure choisie." actions={<button className="btn btn-primary" onClick={newSchedule}><Plus size={16}/> Programmer</button>}/>
    {!cloudMode && <div className="notice-row notice-dark"><AlertTriangle size={19}/><div><strong>Connexion nécessaire</strong><span>{cloudHint}</span></div></div>}
    <details className="n46-page-help"><summary>Comment fonctionnent les programmations ?</summary><p>{cloudHint}</p><p>Une pause stoppe les nouvelles répétitions dans Nashra. Les messages déjà programmés sur Telegram doivent être annulés séparément ; Nashra vérifie les confirmations et signale les incertitudes.</p></details>
    {error && <p className={`feedback-box feedback-${severity}`} role={severity === 'error' ? 'alert' : 'status'}>{error}</p>}
    <div className="n40-layout">
      <section className="n40-calendar" aria-label="Calendrier des publications">
        <div className="n40-month"><strong>{new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(month)}</strong><div>
          <button aria-label="Mois précédent" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth()-1, 1))}><ChevronLeft size={17}/></button>
          <button onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Aujourd’hui</button>
          <button aria-label="Mois suivant" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth()+1, 1))}><ChevronRight size={17}/></button>
        </div></div>
        <div className="n40-days">{['L','M','M','J','V','S','D'].map((w,i) => <span key={i}>{w}</span>)}</div>
        <div className="n40-grid">{dayCells.map(d => {
          const events = eventsByDay.get(key(d)) ?? [];
          return <div key={key(d)} className={`n40-day ${d.getMonth() !== month.getMonth() ? 'outside' : ''} ${key(d) === today ? 'today' : ''}`}>
            <span>{d.getDate()}</span>{events.slice(0,2).map(x => <small key={x.c.id+x.at} className={isPaused(x.c) ? 'paused' : ''} title={x.c.name}>{x.c.name}</small>)}
            {events.length > 2 && <em>+{events.length - 2}</em>}
          </div>;
        })}</div>
      </section>
      <section className="n40-side" aria-label="Campagnes">
        <div className="n40-side-head"><h2>Vos programmations</h2><span className="n46-count">{data.campaigns.length} au total</span></div>
        {data.campaigns.length === 0 ? <EmptyState icon={<CalendarDays size={24}/>} title="Aucune programmation" description="Créez une annonce et choisissez une date." action={<button className="btn btn-primary" onClick={newSchedule}>Programmer</button>}/> :
          [...data.campaigns].sort((a,b) => a.scheduledAt.localeCompare(b.scheduledAt)).map(c => {
            const queued = queueByCampaign.get(c.id) ?? [];
            const notices = queueNotices(queued);
            const state = scheduleView({ paused: isPaused(c), recurring: c.recurrence?.mode === 'interval',
              nativeTelegram: c.nativeTelegram === true, recurringEnabled, loaded: statusLoaded, loading: !statusInitialized,
              jobs: queued, ruleProblem: ruleProblems[c.id], now: Date.now() });
            const currentOperation = runningAction?.id === c.id ? runningAction.action : null;
            return <article className="n40-item" key={c.id} aria-busy={Boolean(currentOperation)}>
              <div className="n40-item-head"><strong>{c.name}</strong><Badge tone={state.tone}>{isPaused(c) && state.attention ? 'Pause à confirmer' : state.label}</Badge></div>
              <p><Clock3 size={13}/>{c.recurrence?.mode === 'interval'
                ? `Tous les ${c.recurrence.intervalDays} jour${c.recurrence.intervalDays > 1 ? 's' : ''} à ${new Intl.DateTimeFormat('fr-FR',{hour:'2-digit',minute:'2-digit',timeZone:c.recurrence.timeZone}).format(new Date(c.scheduledAt))} (${c.recurrence.timeZone})`
                : formatDate(c.scheduledAt)}</p>
              <p><Send size={13}/>{c.destinationIds.length} destination{c.destinationIds.length > 1 ? 's' : ''}</p>
              {state.attention && <div className="n52-compact-warning" role="status">
                <AlertTriangle size={16} aria-hidden="true" />
                <div><strong>{isPaused(c) ? 'En pause — un contrôle reste nécessaire' : 'Une publication reste à vérifier'}</strong>
                  <p>{isPaused(c)
                    ? 'Nashra a suspendu les répétitions. Un message peut encore être prévu dans Telegram.'
                    : 'Nashra ne peut pas encore confirmer le résultat de cet envoi.'}</p>
                </div>
              </div>}
              {state.attention && <ScheduleVerification campaignId={c.id} jobs={queued} destinations={destinationNames} originalHandles={c.destinationHandles} onChanged={refreshQueue}/>}
              {autoRepairingId === c.id && <p className="n48-operation-status" role="status" aria-live="polite">
                <LoaderCircle className="n48-spin" size={15} aria-hidden="true" />Synchronisation de la configuration en cours…
              </p>}
              {currentOperation && <p className="n48-operation-status" role="status" aria-live="polite">
                <LoaderCircle className="n48-spin" size={15} aria-hidden="true" />
                {currentOperation === 'delete' ? 'Suppression en cours — vérification de Telegram…' :
                  currentOperation === 'pause' ? 'Mise en pause et annulation en cours…' : currentOperation === 'repair' ? 'Synchronisation de la règle en cours — aucun envoi Telegram…' : 'Reprise de la programmation en cours…'}
              </p>}
              <div className="n40-item-actions">
                {(c.recurrence?.mode === 'interval' || !c.nativeTelegram) && <button type="button" disabled={busy} onClick={() => void actionOn(c, isPaused(c) ? 'resume' : 'pause')}>
                  {currentOperation === (isPaused(c) ? 'resume' : 'pause')
                    ? <LoaderCircle size={14} className="n48-spin" aria-hidden="true" />
                    : isPaused(c) ? <Play size={14} /> : <Pause size={14} />}
                  {currentOperation === 'resume' ? 'Reprise…' : currentOperation === 'pause' ? 'Pause…' : isPaused(c) ? 'Reprendre' : 'Pause'}
                </button>}
                <button type="button" disabled={busy} onClick={() => void actionOn(c, 'delete')}>
                  {currentOperation === 'delete' ? <LoaderCircle size={14} className="n48-spin" aria-hidden="true" /> : <Trash2 size={14} />}
                  {currentOperation === 'delete' ? 'Suppression…' : 'Supprimer'}
                </button>
              </div>
              {cardFeedback?.id === c.id && <p className={`feedback-box feedback-${cardFeedback.kind}`} role={cardFeedback.kind === 'error' ? 'alert' : 'status'} aria-live="polite" style={{ marginTop: 12 }}>
                {cardFeedback.text}
              </p>}
              <details className="n46-details">
                <summary>Voir les détails techniques</summary>
                <p>Début : {formatDate(c.scheduledAt)}</p>
                <p>Telegram : {state.confirmedFuture} message{state.confirmedFuture > 1 ? 's' : ''} futur{state.confirmedFuture > 1 ? 's' : ''} confirmé{state.confirmedFuture > 1 ? 's' : ''} dans la file Nashra.</p>
                {notices.length ? <ul>{notices.map(n => <li key={n.text}>{n.text}</li>)}</ul>
                  : <p>Aucun historique de livraison disponible pour cette programmation.</p>}
                {ruleProblems[c.id] && <p>Dernier diagnostic : {readable(ruleProblems[c.id], 'À vérifier dans Telegram.')}</p>}
                {c.recurrence?.mode === 'interval' && isPaused(c) &&
                  /Règle modifiée|désynchronis|absente de l.espace de travail/i.test(ruleProblems[c.id] ?? '') &&
                  <button type="button" className="n48-verify-btn" disabled={busy} onClick={() => void repairRule(c)}>
                    {currentOperation === 'repair' ? <LoaderCircle size={14} className="n48-spin" aria-hidden="true"/> : <AlertTriangle size={14}/>}
                    {currentOperation === 'repair' ? 'Réparation…' : 'Tenter une réparation manuelle'}
                  </button>}
                <p>Ces compteurs reflètent la base Nashra, pas une garantie de livraison dans Telegram.</p>
              </details>
            </article>;
          })}
      </section>
    </div>
    {open && <Modal title="Programmer une publication" subtitle="Publication automatique aux groupes que vous êtes autorisé à utiliser." onClose={() => !busy && !submitLock.current && setOpen(false)}>
      <form className="form-stack" aria-busy={busy} onSubmit={e => { e.preventDefault(); void send('schedule'); }}>
        <label className="field-label">Nom de la programmation<input maxLength={90} required disabled={busy} value={name} onChange={e => setName(e.target.value)}/></label>
        <div className="field-label"><span>Annonce</span>
  <SearchableSelect ariaLabel="Annonce à programmer" disabled={busy} value={announcementId}
    onChange={value => { setAnnouncementId(value); if (!name.trim()) setName(data.announcements.find(a => a.id === value)?.title ?? ''); }}
    placeholder="Choisir une annonce" searchPlaceholder="Rechercher une annonce…"
    options={data.announcements.map(a => ({value:a.id,label:a.title,detail:a.category}))}/>
</div>
        <label className="field-label">Type de programmation
          <select data-tour="schedule-mode" disabled={busy} value={scheduleType} onChange={e => setScheduleType(e.target.value as 'once'|'interval')}>
            <option value="once">Une seule fois</option>
            <option value="interval">Répéter automatiquement</option>
          </select>
        </label>
        {scheduleType === 'interval' && <>
          <label className="field-label">Répéter tous les combien de jours ?
            <select data-tour="schedule-interval" disabled={busy} value={intervalDays} onChange={e => setIntervalDays(Number(e.target.value))}>
              {[1,2,3,4,5,7,14,30].map(n => <option key={n} value={n}>Tous les {n} jour{n > 1 ? 's' : ''}</option>)}
            </select>
          </label>
          <label className="field-label">Fuseau horaire (IANA)
            <input disabled={busy} value={timeZone} onChange={e => setTimeZone(e.target.value)} data-tour="schedule-timezone" placeholder="Asia/Riyadh" required maxLength={80}/>
          </label>
          <label className="field-label">Date de fin (facultative)
            <input data-tour="schedule-until" type="date" disabled={busy} value={untilDate} onChange={e => setUntilDate(e.target.value)} />
          </label>
        </>}
        <label className="field-label">{scheduleType === 'interval' ? 'Première diffusion (jour et heure)' : 'Date et heure'}
  <input type="datetime-local" required disabled={busy} value={date} onChange={e => setDate(e.target.value)}/>
  <small style={{lineHeight: 1.6}}>Heure locale de votre appareil : {Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'}.
    {Number.isFinite(Date.parse(date)) && <> Publication choisie : <strong>{new Intl.DateTimeFormat('fr-FR', { dateStyle:'full', timeStyle:'short' }).format(new Date(date))}</strong>.</>}
  </small>
</label>
        <div className="n40-dest"><strong>Groupes autorisés</strong><span>Recherchez et sélectionnez jusqu’à {scheduleType === 'interval' ? 10 : 5} destinations autorisées.</span>
  {candidates.length ? <SearchableMultiSelect disabled={busy} values={destIds} onChange={setDestIds}
    ariaLabel="Destinations à programmer" placeholder="Rechercher et choisir des destinations"
    max={scheduleType === 'interval' ? 10 : 5}
    options={candidates.map(d => ({value:d.id,label:d.name,detail:d.topicId ? `Sujet : ${d.topicTitle || d.topicId}` : d.category}))}/> :
    <p>Ajoutez d’abord un groupe depuis <Link href="/groupes">Destinations</Link>.</p>}
</div>
        <p className="n40-footnote" data-tour="group-stagger">{scheduleType === 'interval'
          ? `Vous autorisez ${destIds.length} diffusion(s) par occurrence. Le premier groupe démarre à l’heure indiquée ; les suivants à 90 secondes d’intervalle. Nashra prépare les prochains jours sur Telegram et les renouvelle quotidiennement via un Cron serveur. Maximum 10 groupes par règle ; restrictions et quotas toujours applicables.`
          : `Vous autorisez ${destIds.length} publication(s) uniques. Telegram doit accepter chaque programmation. Maximum 5 groupes par action.`}</p>
        {scheduleType === 'interval' && !recurringEnabled && <p className="n40-error" role="status">Le moteur récurrent doit être activé côté serveur (NASHRA_RECURRING_ENABLED=1 et Cron configuré).</p>}
        {error && <p className={`feedback-box feedback-${severity}`} role={severity === 'error' ? 'alert' : 'status'}>{error}</p>}
        <div className="modal-actions"><button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setOpen(false)}>Annuler</button>
          <button type="submit" className="btn btn-primary" disabled={busy || !announcementId || !destIds.length || destIds.length > (scheduleType === 'interval' ? 10 : 5) || !cloudMode || syncStatus !== 'synced' || (scheduleType === 'interval' && !recurringEnabled)}>
            {busy ? <LoaderCircle size={16} className="n39-send-spinner" aria-hidden="true"/> : <CalendarDays size={16}/>}
            {busy ? 'Programmation en cours…' : 'Confirmer la programmation'}</button></div>
      </form>
    </Modal>}
    {/* NASHRA_041_VISIBLE_SCHEDULE_PROGRESS — portal outside scrollable modal */}
    {busy && open && typeof document !== 'undefined' && createPortal(
      <div className="n41-schedule-overlay" role="status" aria-live="polite" aria-label="Enregistrement de la programmation en cours">
        <div className="n41-schedule-panel">
          <span className="n41-schedule-eyebrow">Nashra · Publications programmées</span>
          <div className="n41-schedule-row"><LoaderCircle size={20} aria-hidden="true"/><strong>Programmation en cours</strong><span className="n41-schedule-seconds" aria-hidden="true">{scheduleElapsed} s</span></div>
          <div className="n41-schedule-track" aria-hidden="true"><span/></div>
          <p>Nous enregistrons votre publication et vérifions {destIds.length} destination{destIds.length > 1 ? 's' : ''}.</p>
          <small>{scheduleElapsed < 15 ? 'Ne fermez pas la page pendant cette opération.' : 'La confirmation prend plus de temps que prévu. Ne relancez pas la publication.'}</small>
        </div>
      </div>, document.body
    )}
  </>;
}
