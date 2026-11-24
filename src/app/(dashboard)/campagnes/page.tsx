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
import './campaigns-v2.css';

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
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [campaignFilter, setCampaignFilter] = useState<'all' | 'attention' | 'active' | 'paused'>('all');
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
    setWizardStep(2);
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
    setWizardStep(1);
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
    const unresolved = action === 'resume' && jobs.some(j => j.status === 'needs_review' || j.status === 'processing');
    if (unresolved && jobs.some(j => Date.parse(j.scheduled_at) > Date.now())) {
      setCardFeedback({ id:c.id, kind:'warning', text:'Impossible de reprendre automatiquement : vérifiez d’abord les publications encore incertaines ci-dessus pour éviter un doublon.' });
      return;
    }
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

  const campaignStates = data.campaigns.map(c => ({ c, view: scheduleView({
    paused: isPaused(c), recurring: c.recurrence?.mode === 'interval', nativeTelegram: c.nativeTelegram === true,
    recurringEnabled, loaded: statusLoaded, loading: !statusInitialized,
    jobs: queueByCampaign.get(c.id) ?? [], ruleProblem: ruleProblems[c.id], now: Date.now(),
  }) }));
  const attentionCount = campaignStates.filter(x => x.view.attention).length;
  const activeCount = campaignStates.filter(x => !isPaused(x.c) && !x.view.attention).length;
  const visibleCampaigns = campaignStates.filter(x => campaignFilter === 'all' ||
    (campaignFilter === 'attention' && x.view.attention) ||
    (campaignFilter === 'active' && !isPaused(x.c) && !x.view.attention) ||
    (campaignFilter === 'paused' && isPaused(x.c))
  ).sort((a,b) => Number(b.view.attention) - Number(a.view.attention) || a.c.scheduledAt.localeCompare(b.c.scheduledAt));
  const canGoStep2 = Boolean(announcementId && data.announcements.some(a => a.id === announcementId));
  const maxDestinations = scheduleType === 'interval' ? 10 : 5;
  const canGoStep3 = destIds.length > 0 && destIds.length <= maxDestinations;
  const canSubmit = canGoStep2 && canGoStep3 && !busy && cloudMode && syncStatus === 'synced' &&
    (scheduleType !== 'interval' || recurringEnabled) && Number.isFinite(Date.parse(date)) &&
    Date.parse(date) > Date.now() + 180_000;

  return <>
    <PageHeader eyebrow="VOS PUBLICATIONS TELEGRAM" title="Campagnes" description="Préparez une annonce, choisissez vos groupes et laissez Nashra s'occuper de la programmation." actions={<button className="btn btn-primary" onClick={newSchedule}><Plus size={16}/> Nouvelle campagne</button>}/>
    <section className="nashra-campaign-overview" aria-label="Résumé de vos campagnes">
      <div><span>À suivre</span><strong>{data.campaigns.length}</strong><small>campagnes au total</small></div>
      <div className={attentionCount ? 'needs-help' : ''}><span>Votre attention</span><strong>{statusLoaded ? attentionCount : '—'}</strong><small>{!statusLoaded ? 'Vérification indisponible' : attentionCount ? 'Une action peut être nécessaire' : 'Rien à vérifier actuellement'}</small></div>
      <div><span>Sans alerte</span><strong>{statusLoaded ? activeCount : '—'}</strong><small>campagnes non suspendues</small></div>
    </section>
    {attentionCount > 0 && statusLoaded && <div className="nashra-campaign-alert" role="status"><AlertTriangle size={20}/><div><strong>{attentionCount} campagne{attentionCount > 1 ? 's' : ''} à vérifier</strong><p>Nashra a détecté des publications nécessitant une confirmation. Elles apparaissent en premier. Aucune relance incertaine ne sera effectuée automatiquement.</p></div><button type="button" onClick={() => setCampaignFilter('attention')}>Voir les campagnes</button></div>}
    {!cloudMode && <div className="notice-row notice-dark"><AlertTriangle size={19}/><div><strong>Connexion nécessaire</strong><span>La synchronisation de votre compte doit être disponible avant de créer une campagne.</span></div></div>}
    {error && <p className={`feedback-box feedback-${severity}`} role={severity === 'error' ? 'alert' : 'status'}>{error}</p>}
    <div className="nashra-campaign-primary">
      <section className="nashra-campaign-list" aria-label="Campagnes">
        <div className="nashra-campaign-list-head"><div><h2>Vos campagnes</h2><p>Retrouvez leur état et la prochaine action utile.</p></div><div className="nashra-campaign-filters" role="group" aria-label="Filtrer les campagnes">
          {([['all','Toutes'],['attention','À vérifier'],['active','En cours'],['paused','En pause']] as const).map(([value,label]) => <button key={value} type="button" aria-pressed={campaignFilter === value} onClick={() => setCampaignFilter(value)}>{label}</button>)}
        </div></div>
        {data.campaigns.length === 0 ? <div className="nashra-campaign-empty"><EmptyState icon={<CalendarDays size={24}/>} title="Votre première campagne en quelques clics" description="Choisissez une annonce, vos groupes et un horaire. Nashra vous guide pour le reste." action={<button className="btn btn-primary" onClick={newSchedule}>Créer ma première campagne</button>}/></div> :
          visibleCampaigns.length === 0 ? <div className="nashra-campaign-empty"><p>Aucune campagne dans cette catégorie.</p><button type="button" className="btn btn-secondary" onClick={() => setCampaignFilter('all')}>Voir toutes les campagnes</button></div> :
          visibleCampaigns.map(({c}) => {
            const queued = queueByCampaign.get(c.id) ?? [];
            const notices = queueNotices(queued);
            const state = scheduleView({ paused: isPaused(c), recurring: c.recurrence?.mode === 'interval',
              nativeTelegram: c.nativeTelegram === true, recurringEnabled, loaded: statusLoaded, loading: !statusInitialized,
              jobs: queued, ruleProblem: ruleProblems[c.id], now: Date.now() });
            const currentOperation = runningAction?.id === c.id ? runningAction.action : null;
            return <article className={`n40-item nashra-campaign-card ${state.attention ? 'nashra-campaign-card-attention' : ''}`} key={c.id} aria-busy={Boolean(currentOperation)}>
              <div className="n40-item-head"><strong>{c.name}</strong><Badge tone={state.tone}>{state.attention ? 'Action nécessaire' : isPaused(c) ? 'En pause' : state.label}</Badge></div>


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
                {(c.recurrence?.mode === 'interval' || !c.nativeTelegram) && <button type="button" disabled={busy || (isPaused(c) && queued.some(j => (j.status === 'needs_review' || j.status === 'processing') && Date.parse(j.scheduled_at) > Date.now()))} onClick={() => void actionOn(c, isPaused(c) ? 'resume' : 'pause')}>
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
      <details className="nashra-campaign-calendar-details"><summary><CalendarDays size={17}/> Afficher le calendrier des publications</summary>
        <section className="n40-calendar" aria-label="Calendrier des publications">
          <div className="n40-month"><strong>{new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(month)}</strong><div>
            <button aria-label="Mois précédent" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth()-1, 1))}><ChevronLeft size={17}/></button>
            <button onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Aujourd’hui</button>
            <button aria-label="Mois suivant" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth()+1, 1))}><ChevronRight size={17}/></button>
          </div></div>
          <div className="n40-days">{['L','M','M','J','V','S','D'].map((w,i) => <span key={i}>{w}</span>)}</div>
          <div className="n40-grid">{dayCells.map(d => { const events = eventsByDay.get(key(d)) ?? []; return <div key={key(d)} className={`n40-day ${d.getMonth() !== month.getMonth() ? 'outside' : ''} ${key(d) === today ? 'today' : ''}`}><span>{d.getDate()}</span>{events.slice(0,2).map(x => <small key={x.c.id+x.at} className={isPaused(x.c) ? 'paused' : ''} title={x.c.name}>{x.c.name}</small>)}{events.length > 2 && <em>+{events.length - 2}</em>}</div>; })}</div>
        </section>
      </details>
    </div>
    {open && <Modal title="Créer une campagne" subtitle="Trois choix simples. Vous pourrez toujours revenir en arrière." onClose={() => !busy && !submitLock.current && setOpen(false)}>
      <form className="form-stack nashra-campaign-wizard" aria-busy={busy} onSubmit={e => { e.preventDefault(); if (wizardStep < 3) { if (wizardStep === 1 && canGoStep2) setWizardStep(2); else if (wizardStep === 2 && canGoStep3) setWizardStep(3); return; } if (canSubmit) void send('schedule'); }}>
        <div className="nashra-wizard-progress" aria-label={`Étape ${wizardStep} sur 3`}>{([1,2,3] as const).map(n => <span key={n} className={n <= wizardStep ? 'current' : ''}>{n === 1 ? 'Annonce' : n === 2 ? 'Groupes' : 'Horaire'}</span>)}</div>
        {wizardStep === 1 && <><h3>Que voulez-vous publier ?</h3><p className="nashra-wizard-hint">Choisissez une annonce que vous avez déjà préparée. Nashra reprend son titre automatiquement.</p>
          {data.announcements.length === 0 && <p className="nashra-wizard-hint">Vous n'avez pas encore d'annonce. <Link href="/annonces">Créer une annonce</Link> avant de revenir ici.</p>}
          <div className="field-label"><span>Votre annonce</span><SearchableSelect ariaLabel="Annonce à programmer" disabled={busy} value={announcementId} onChange={value => { setAnnouncementId(value); setName(data.announcements.find(a => a.id === value)?.title ?? ''); }} placeholder="Choisir mon annonce" searchPlaceholder="Rechercher une annonce…" options={data.announcements.map(a => ({value:a.id,label:a.title,detail:a.category}))}/></div>
        </>}
        {wizardStep === 2 && <><h3>Où voulez-vous publier ?</h3><p className="nashra-wizard-hint">Sélectionnez uniquement les groupes où vous avez le droit de publier. Nashra se chargera de les programmer.</p>
          <div className="n40-dest"><strong>{destIds.length} groupe{destIds.length > 1 ? 's' : ''} sélectionné{destIds.length > 1 ? 's' : ''}</strong><span>Choisissez jusqu'à {maxDestinations} destinations.</span>
            {candidates.length ? <SearchableMultiSelect disabled={busy} values={destIds} onChange={setDestIds} ariaLabel="Destinations à programmer" placeholder="Choisir mes groupes" max={maxDestinations} options={candidates.map(d => ({value:d.id,label:d.name,detail:d.topicId ? `Sujet : ${d.topicTitle || d.topicId}` : d.category}))}/> : <p>Aucun groupe autorisé. <Link href="/groupes">Ajouter un groupe</Link> pour continuer.</p>}
          </div>
        </>}
        {wizardStep === 3 && <><h3>Quand voulez-vous publier ?</h3><p className="nashra-wizard-hint">Choisissez une date. Pour répéter, activez l'option ci-dessous. Vous n'avez rien d'autre à configurer.</p>
          <div className="nashra-wizard-mode" role="group" aria-label="Fréquence"><button type="button" className={scheduleType === 'once' ? 'selected' : ''} onClick={() => setScheduleType('once')}>Une seule fois</button><button type="button" className={scheduleType === 'interval' ? 'selected' : ''} onClick={() => setScheduleType('interval')}>Régulièrement</button></div>
          <label className="field-label">{scheduleType === 'interval' ? 'Première publication' : 'Date et heure'}<input type="datetime-local" required disabled={busy} value={date} onChange={e => setDate(e.target.value)}/></label>
          {scheduleType === 'interval' && <><label className="field-label">Répéter<select data-tour="schedule-interval" disabled={busy} value={intervalDays} onChange={e => setIntervalDays(Number(e.target.value))}>{[1,2,3,4,5,7,14,30].map(n => <option key={n} value={n}>Tous les {n} jour{n > 1 ? 's' : ''}</option>)}</select></label><details className="nashra-wizard-advanced"><summary>Options avancées (facultatif)</summary><label className="field-label">Fuseau horaire<input disabled={busy} value={timeZone} onChange={e => setTimeZone(e.target.value)} required maxLength={80}/></label><label className="field-label">Date de fin<input type="date" disabled={busy} value={untilDate} onChange={e => setUntilDate(e.target.value)}/></label></details>{!recurringEnabled && <p className="n40-error">La répétition n'est pas disponible actuellement. Choisissez « Une seule fois ».</p>}</>}
          <div className="nashra-wizard-summary"><strong>Votre programmation</strong><p>{data.announcements.find(a => a.id === announcementId)?.title || 'Annonce'} · {destIds.length} groupe{destIds.length > 1 ? 's' : ''}</p><p>{scheduleType === 'interval' ? `Tous les ${intervalDays} jours` : 'Une seule fois'} · {Number.isFinite(Date.parse(date)) ? formatDate(new Date(date).toISOString()) : 'Date à choisir'}</p></div>
        </>}
        {error && <p className={`feedback-box feedback-${severity}`} role={severity === 'error' ? 'alert' : 'status'}>{error}</p>}
        <div className="modal-actions"><button type="button" className="btn btn-secondary" disabled={busy} onClick={() => wizardStep === 1 ? setOpen(false) : setWizardStep((wizardStep - 1) as 1 | 2 | 3)}>{wizardStep === 1 ? 'Annuler' : 'Retour'}</button><button type="submit" className="btn btn-primary" disabled={busy || (wizardStep === 1 && !canGoStep2) || (wizardStep === 2 && !canGoStep3) || (wizardStep === 3 && !canSubmit)}>{busy ? 'Programmation en cours…' : wizardStep === 3 ? 'Programmer ma campagne' : 'Continuer'}</button></div>
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
