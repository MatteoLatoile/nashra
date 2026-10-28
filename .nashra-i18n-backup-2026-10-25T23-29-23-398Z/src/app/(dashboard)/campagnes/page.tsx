'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  AlertTriangle, CalendarDays, CalendarRange, CheckCircle2, ChevronLeft, ChevronRight,
  Clock3, Copy, ExternalLink, Eye, Info, List, Pause, Pencil, Play, Plus,
  Repeat2, Send, ShieldCheck, Trash2,
} from 'lucide-react';
import { Badge, EmptyState, Modal, PageHeader } from '@/components/ui';
import { useConfirm } from '@/components/confirm-dialog';
import { dateFR, timeFR, useApp, type Campaign, type Method } from '@/lib/store';

const weekdays = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const asLocal = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const tomorrow = () => {
  const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0);
  return asLocal(d);
};
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const weekday = (d: Date) => (d.getDay() + 6) % 7;
const longMonth = (d: Date) => d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
const methodLabel = (m: Method) => m === 'forward' ? 'Transfert' : 'Republication';
const getAnnouncementIds = (c: Campaign) => c.announcementIds?.length ? c.announcementIds : [c.announcementId];
const getDates = (c: Campaign) => c.scheduledDates?.length ? c.scheduledDates : [c.scheduledAt];

/** Les dates sont générées en heure locale du navigateur, puis stockées en UTC. Aucune tâche n'est envoyée. */
function plannedDates(startValue: string, mode: 'once' | 'weekly', days: number[], weeks: number) {
  const start = new Date(startValue);
  if (!Number.isFinite(start.getTime())) return [];
  if (mode === 'once') return [start.toISOString()];
  if (!days.length || weeks < 1 || weeks > 8) return [];
  const result: string[] = [];
  // Nouvelle date locale chaque jour : l'heure affichée reste stable lors des changements d'heure.
  for (let offset = 0; offset < weeks * 7; offset++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset, start.getHours(), start.getMinutes());
    if (days.includes(weekday(d)) && d.getTime() >= start.getTime()) result.push(d.toISOString());
  }
  return result;
}

type CalendarEvent = { campaign: Campaign; at: string };

function CampaignContent() {
  const { data, addCampaign, updateCampaign, removeCampaign, toggleCampaign, cloudMode, notify } = useApp();
  const confirm = useConfirm();
  const search = useSearchParams();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [announcementIds, setAnnouncementIds] = useState<string[]>([]);
  const [destinationIds, setDestinationIds] = useState<string[]>([]);
  const [method, setMethod] = useState<Method>('forward');
  const [scheduledAt, setScheduledAt] = useState(tomorrow);
  const [repeatMode, setRepeatMode] = useState<'once' | 'weekly'>('once');
  const [repeatDays, setRepeatDays] = useState<number[]>([weekday(new Date(tomorrow()))]);
  const [repeatWeeks, setRepeatWeeks] = useState(4);
  const [tab, setTab] = useState<'Toutes' | 'À venir' | 'À revoir' | 'En pause'>('Toutes');
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [shownMonth, setShownMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const eligible = data.destinations.filter(d => d.authorized);
  const preview = data.campaigns.find(c => c.id === previewId);
  const proposedDates = useMemo(() => plannedDates(scheduledAt, repeatMode, repeatDays, repeatWeeks), [scheduledAt, repeatMode, repeatDays, repeatWeeks]);
  const now = Date.now();
  const today = dayKey(new Date());

  function openCreate(template?: Campaign) {
    setEditingId(null);
    setName(template ? `${template.name} · copie` : '');
    setAnnouncementIds(template ? getAnnouncementIds(template).filter(id => data.announcements.some(a => a.id === id)) : []);
    setDestinationIds(template?.destinationIds.filter(id => eligible.some(d => d.id === id)) ?? []);
    setMethod(template?.method ?? 'forward');
    const next = template ? new Date(template.scheduledAt) : new Date(tomorrow());
    if (template) next.setDate(next.getDate() + 7);
    const safe = next.getTime() > Date.now() ? next : new Date(tomorrow());
    setScheduledAt(asLocal(safe));
    setRepeatMode(template?.recurrence?.mode ?? 'once');
    setRepeatDays(template?.recurrence?.weekdays?.length ? [...template.recurrence.weekdays] : [weekday(safe)]);
    setRepeatWeeks(template?.recurrence?.weeks ?? 4);
    setEditorOpen(true);
  }
  function openEdit(c: Campaign) {
    setEditingId(c.id);
    setName(c.name);
    setAnnouncementIds(getAnnouncementIds(c).filter(id => data.announcements.some(a => a.id === id)));
    setDestinationIds(c.destinationIds.filter(id => eligible.some(d => d.id === id)));
    setMethod(c.method);
    setScheduledAt(asLocal(new Date(c.scheduledAt)));
    setRepeatMode(c.recurrence?.mode ?? 'once');
    setRepeatDays(c.recurrence?.weekdays?.length ? [...c.recurrence.weekdays] : [weekday(new Date(c.scheduledAt))]);
    setRepeatWeeks(c.recurrence?.weeks ?? 4);
    setEditorOpen(true);
  }
  useEffect(() => {
    if (search.get('nouveau') !== '1') return;
    const timer = setTimeout(() => openCreate(), 0);
    return () => clearTimeout(timer);
    // La synchronisation Supabase ne doit pas réinitialiser un formulaire ouvert.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const events = useMemo<CalendarEvent[]>(() => data.campaigns.flatMap(c => getDates(c)
    .filter(at => Number.isFinite(Date.parse(at)))
    .map(at => ({ campaign: c, at })))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at)), [data.campaigns]);
  const upcoming = (c: Campaign) => getDates(c).some(d => Date.parse(d) > now);
  const overdue = (c: Campaign) => c.status === 'scheduled' && getDates(c).some(d => Date.parse(d) <= now);
  const nextDate = (c: Campaign) => getDates(c).find(d => Date.parse(d) > now) ?? getDates(c).at(-1) ?? c.scheduledAt;
  const sorted = [...data.campaigns].sort((a, b) => Date.parse(nextDate(a)) - Date.parse(nextDate(b)));
  const visible = sorted.filter(c => {
    if (selectedDay && view === 'calendar' && !getDates(c).some(d => dayKey(new Date(d)) === selectedDay)) return false;
    if (tab === 'À venir') return c.status === 'scheduled' && upcoming(c);
    if (tab === 'À revoir') return overdue(c);
    if (tab === 'En pause') return c.status === 'paused';
    return true;
  });
  const duplicate = data.campaigns.some(c => c.id !== editingId && c.status === 'scheduled' &&
    c.destinationIds.some(id => destinationIds.includes(id)) &&
    getAnnouncementIds(c).some(id => announcementIds.includes(id)) &&
    getDates(c).some(at => proposedDates.some(date => dayKey(new Date(date)) === dayKey(new Date(at)))));
  const forwardMissing = method === 'forward' && announcementIds.some(id => {
    const a = data.announcements.find(item => item.id === id);
    return !a?.sourceChatId || !a.sourceMessageId;
  });

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim() || !announcementIds.length || !destinationIds.length || !proposedDates.length ||
      Date.parse(proposedDates[0]) <= Date.now()) return;
    const patch = {
      name: name.trim(),
      announcementId: announcementIds[0],
      announcementIds: [...announcementIds],
      destinationIds: [...destinationIds],
      method,
      scheduledAt: proposedDates[0],
      scheduledDates: [...proposedDates],
      recurrence: { mode: repeatMode, weekdays: repeatMode === 'weekly' ? [...repeatDays] : [], weeks: repeatMode === 'weekly' ? repeatWeeks : 1 },
    };
    if (editingId) updateCampaign(editingId, patch); else addCampaign(patch);
    setEditorOpen(false);
  }
  async function remove(c: Campaign) {
    const count = getDates(c).length;
    const approved = await confirm({
      title: 'Supprimer cette campagne ?',
      description: `La campagne et ses ${count} créneau${count > 1 ? 'x' : ''} planifié${count > 1 ? 's' : ''} seront supprimés de votre calendrier.`,
      item: c.name,
      itemLabel: 'CAMPAGNE CONCERNÉE',
      confirmText: 'Supprimer la campagne',
      tone: 'danger',
    });
    if (approved) { removeCampaign(c.id); notify('Campagne supprimée.'); }
  }
  function changeMonth(delta: number) {
    setShownMonth(d => new Date(d.getFullYear(), d.getMonth() + delta, 1));
    setSelectedDay(null);
  }
  function directLink(c: Campaign, adId: string, handle: string) {
    const a = data.announcements.find(item => item.id === adId);
    if (!a?.sourceChatId || !a.sourceMessageId || !/^-?\d{3,30}$/.test(handle)) return null;
    const params = new URLSearchParams({ source: a.sourceChatId, message: String(a.sourceMessageId), destination: handle, mode: c.method });
    return `/telegram?${params.toString()}`;
  }
  const cells = useMemo(() => {
    const start = new Date(shownMonth.getFullYear(), shownMonth.getMonth(), 1);
    start.setDate(start.getDate() - weekday(start));
    return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }, [shownMonth]);
  function toggle<T>(ids: T[], id: T) { return ids.includes(id) ? ids.filter(item => item !== id) : [...ids, id]; }
  const workItems = announcementIds.length * destinationIds.length * proposedDates.length;

  return <>
    <PageHeader eyebrow="PLANIFICATION · NASHRA V0.6" title="Campagnes" description="Plusieurs annonces, plusieurs groupes, plusieurs dates : un seul calendrier éditorial."
      actions={<button className="btn btn-primary" onClick={() => openCreate()}><Plus size={17}/> Nouvelle campagne</button>}/>
    <div className="notice-row notice-dark"><ShieldCheck size={20}/><div><strong>Préparation uniquement · zéro envoi automatique</strong><span>Les campagnes sont sauvegardées {cloudMode ? 'dans Supabase' : 'localement'}. Les créneaux ne déclenchent aucune publication ni notification. Respectez les restrictions Telegram et les règles des groupes.</span></div></div>
    <div className="campaign-summary n5-summary">
      <div><span>Campagnes</span><strong>{data.campaigns.length.toString().padStart(2, '0')}</strong></div>
      <div><span>Créneaux à venir</span><strong>{events.filter(e => e.campaign.status === 'scheduled' && Date.parse(e.at) > now).length.toString().padStart(2, '0')}</strong></div>
      <div><span>Créneaux à revoir</span><strong>{events.filter(e => e.campaign.status === 'scheduled' && Date.parse(e.at) <= now).length.toString().padStart(2, '0')}</strong></div>
      <div><span>Campagnes en pause</span><strong>{data.campaigns.filter(c => c.status === 'paused').length.toString().padStart(2, '0')}</strong></div>
    </div>
    <div className="n5-toolbar">
      <div className="tabs">{(['Toutes', 'À venir', 'À revoir', 'En pause'] as const).map(t => <button key={t} className={`tab ${tab === t ? 'tab-active' : ''}`} onClick={() => setTab(t)}>{t}</button>)}</div>
      <div className="n5-view-switch"><button className={view === 'list' ? 'n5-switch-active' : ''} onClick={() => { setView('list'); setSelectedDay(null); }}><List size={15}/> Liste</button><button className={view === 'calendar' ? 'n5-switch-active' : ''} onClick={() => setView('calendar')}><CalendarDays size={15}/> Calendrier</button></div>
    </div>
    {view === 'calendar' && <section className="n5-calendar">
      <div className="n5-month"><strong>{longMonth(shownMonth)}</strong><div><button aria-label="Mois précédent" onClick={() => changeMonth(-1)}><ChevronLeft size={17}/></button><button onClick={() => { setShownMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); setSelectedDay(null); }}>Aujourd&apos;hui</button><button aria-label="Mois suivant" onClick={() => changeMonth(1)}><ChevronRight size={17}/></button></div></div>
      <div className="n5-calendar-grid">{weekdays.map(day => <div key={day} className="n5-weekday">{day}</div>)}{cells.map(d => {
        const key = dayKey(d); const items = events.filter(e => dayKey(new Date(e.at)) === key);
        return <button key={key} onClick={() => setSelectedDay(selectedDay === key ? null : key)} className={`n5-day ${d.getMonth() !== shownMonth.getMonth() ? 'n5-outside' : ''} ${key === today ? 'n5-today' : ''} ${selectedDay === key ? 'n5-day-selected' : ''}`}>
          <span>{d.getDate()}</span>{items.slice(0, 2).map(e => <small key={`${e.campaign.id}-${e.at}`} className={e.campaign.status === 'paused' ? 'n5-quiet' : Date.parse(e.at) <= now ? 'n5-late' : ''}>{e.campaign.name}</small>)}{items.length > 2 && <i>+{items.length - 2} autres</i>}
        </button>;
      })}</div>
      {selectedDay && <div className="n5-selected-note"><CalendarRange size={15}/>{new Date(`${selectedDay}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} · {events.filter(e => dayKey(new Date(e.at)) === selectedDay).length} créneau(x). <button onClick={() => setSelectedDay(null)}>Tout afficher</button></div>}
    </section>}
    {visible.length ? <div className="campaign-cards">{visible.map(c => {
      const ads = getAnnouncementIds(c);
      const nearest = nextDate(c);
      return <article className="campaign-item" key={c.id}>
        <div className="campaign-icon"><CalendarDays size={23}/></div>
        <div className="campaign-description"><div className="campaign-title-line"><h3>{c.name}</h3><Badge tone={c.status === 'paused' || !upcoming(c) ? 'warn' : 'positive'}>{c.status === 'paused' ? 'En pause' : upcoming(c) ? 'Préparée' : 'À revoir'}</Badge></div><p>{ads.length === 1 ? data.announcements.find(a => a.id === ads[0])?.title ?? 'Annonce introuvable' : `${ads.length} annonces sélectionnées`}</p>
          <div className="campaign-tags"><span><CalendarDays size={14}/>{dateFR(nearest, { day: 'numeric', month: 'long', year: 'numeric' })}</span><span><Clock3 size={14}/>{timeFR(nearest)}</span><span><Repeat2 size={14}/>{getDates(c).length} créneau(x)</span><span><Send size={14}/>{c.destinationIds.length} groupe(s)</span><span>{methodLabel(c.method)}</span></div>
        </div>
        <div className="campaign-actions n5-actions"><button className="mini-action action-border" aria-label="Prévisualiser" title="Prévisualiser" onClick={() => setPreviewId(c.id)}><Eye size={17}/></button><button className="mini-action action-border" aria-label="Modifier" title="Modifier" onClick={() => openEdit(c)}><Pencil size={17}/></button><button className="mini-action action-border" aria-label="Dupliquer" title="Dupliquer" onClick={() => openCreate(c)}><Copy size={17}/></button><button className="mini-action action-border" aria-label={c.status === 'scheduled' ? 'Mettre en pause' : 'Reprendre'} onClick={() => toggleCampaign(c.id)}>{c.status === 'scheduled' ? <Pause size={17}/> : <Play size={17}/>}</button><button className="mini-action action-border" aria-label="Supprimer" onClick={() => remove(c)}><Trash2 size={17}/></button></div>
      </article>;
    })}</div> : <EmptyState icon={<CalendarRange size={25}/>} title="Aucune campagne ici" description="Préparez une campagne ou modifiez vos filtres." action={<button className="btn btn-primary" onClick={() => openCreate()}><Plus size={16}/> Nouvelle campagne</button>}/>}
    {preview && <Modal title={preview.name} subtitle="Vérification des annonces, destinations et dates. Aucun envoi n'a lieu ici." onClose={() => setPreviewId(null)}>
      <div className="n5-preview-meta"><span><CalendarDays size={15}/>{getDates(preview).length} créneau(x)</span><span>{methodLabel(preview.method)}</span><span>{getAnnouncementIds(preview).length} annonce(s)</span></div>
      <h4 className="n5-group-title">Dates prévues</h4>
      <div className="n6-date-preview">{getDates(preview).slice(0, 14).map(at => <span key={at}>{dateFR(at, { weekday: 'short', day: 'numeric', month: 'short' })} · {timeFR(at)}</span>)}{getDates(preview).length > 14 && <span>+{getDates(preview).length - 14} autres créneaux</span>}</div>
      <h4 className="n5-group-title">Annonces sélectionnées</h4>
      <div className="n6-preview-ads">{getAnnouncementIds(preview).map(id => {
        const a = data.announcements.find(x => x.id === id);
        return <div key={id}><strong>{a?.title ?? 'Annonce supprimée'}</strong><p>{a?.body?.slice(0, 240) || 'Aucun texte enregistré. Le message source peut contenir un média.'}</p></div>;
      })}</div>
      <h4 className="n5-group-title">Destinations et préparation unitaire</h4>
      <div className="n5-review-list">{preview.destinationIds.map(id => {
        const d = data.destinations.find(x => x.id === id);
        return <div className="n6-destination" key={id}><span><ShieldCheck size={15}/>{d?.name ?? 'Destination supprimée'}</span><div className="n6-links">{getAnnouncementIds(preview).map(adId => {
          const ad = data.announcements.find(x => x.id === adId);
          const link = d?.authorized ? directLink(preview, adId, d.handle) : null;
          return link ? <Link key={adId} href={link} className="n5-review-link" onClick={() => setPreviewId(null)}>{ad?.title ?? 'Annonce'} <ExternalLink size={13}/></Link> : <small key={adId}>{ad?.title ?? 'Annonce'} : source ou autorisation manquante</small>;
        })}</div></div>;
      })}</div>
      <div className="inline-help"><Info size={16}/> Ces liens ouvrent la préparation d&apos;un message dans Nashra. Aucun transfert n&apos;est déclenché automatiquement. Les restrictions Telegram restent applicables.</div>
      <div className="modal-actions"><button className="btn btn-secondary" onClick={() => setPreviewId(null)}>Fermer</button><button className="btn btn-primary" onClick={() => { setPreviewId(null); openEdit(preview); }}><Pencil size={16}/> Modifier</button></div>
    </Modal>}
    {editorOpen && <Modal title={editingId ? 'Modifier la campagne' : 'Nouvelle campagne'} subtitle="Créez plusieurs créneaux de préparation, sans publication automatique." onClose={() => setEditorOpen(false)}>
      <form className="form-stack" onSubmit={submit}>
        <label className="field-label">Nom <span>*</span><input required maxLength={90} value={name} onChange={e => setName(e.target.value)} placeholder="Ex. Appartements Médine · novembre" autoFocus/></label>
        <div className="field-label"><span>Annonces <span>*</span></span><div className="n6-select-head"><small>{announcementIds.length} sélectionnée(s)</small><button type="button" onClick={() => setAnnouncementIds(data.announcements.map(a => a.id))}>Tout sélectionner</button><button type="button" onClick={() => setAnnouncementIds([])}>Effacer</button></div><div className="group-check-list n6-check-list">{data.announcements.length ? data.announcements.map(a => <label key={a.id}><input type="checkbox" checked={announcementIds.includes(a.id)} onChange={() => setAnnouncementIds(v => toggle(v, a.id))}/><span>{a.title}</span><small>{a.category}</small></label>) : <p className="no-groups">Ajoutez d&apos;abord vos annonces dans « Mes annonces ».</p>}</div></div>
        <div className="field-label"><span>Mode</span><div className="radio-tiles"><label className={method === 'repost' ? 'radio-selected' : ''}><input type="radio" name="method" checked={method === 'repost'} onChange={() => setMethod('repost')}/><Send size={17}/><span><strong>Republication</strong><small>Nouvelle publication</small></span></label><label className={method === 'forward' ? 'radio-selected' : ''}><input type="radio" name="method" checked={method === 'forward'} onChange={() => setMethod('forward')}/><Repeat2 size={17}/><span><strong>Transfert</strong><small>Message original</small></span></label></div></div>
        {forwardMissing && <div className="inline-help"><Info size={16}/> Certaines annonces sélectionnées n&apos;ont pas de message Telegram source. Pour les transférer, importez-les d&apos;abord dans la rubrique Telegram.</div>}
        <label className="field-label">Date et heure de départ <span>*</span><input type="datetime-local" required value={scheduledAt} onChange={e => setScheduledAt(e.target.value)}/></label>
        <div className="field-label"><span>Répétition</span><div className="n6-repeat-options"><label className={repeatMode === 'once' ? 'n6-choice-active' : ''}><input type="radio" name="recurrence" checked={repeatMode === 'once'} onChange={() => setRepeatMode('once')}/> Une seule date</label><label className={repeatMode === 'weekly' ? 'n6-choice-active' : ''}><input type="radio" name="recurrence" checked={repeatMode === 'weekly'} onChange={() => { setRepeatMode('weekly'); if (!repeatDays.length) setRepeatDays([weekday(new Date(scheduledAt))]); }}/> Plusieurs jours par semaine</label></div></div>
        {repeatMode === 'weekly' && <div className="n6-repeat-box"><strong>Jours à préparer</strong><div className="n6-weekdays">{weekdays.map((day, index) => <button type="button" key={day} className={repeatDays.includes(index) ? 'selected' : ''} aria-pressed={repeatDays.includes(index)} onClick={() => setRepeatDays(v => toggle(v, index).sort())}>{day}</button>)}</div><label className="field-label">Durée du planning<select value={repeatWeeks} onChange={e => setRepeatWeeks(Number(e.target.value))}><option value={1}>1 semaine</option><option value={2}>2 semaines</option><option value={4}>4 semaines</option><option value={8}>8 semaines</option></select></label></div>}
        <div className="n6-planning-preview"><div><strong>Aperçu des créneaux</strong><small>{proposedDates.length} date(s) à partir de votre heure locale</small></div><div className="n6-date-preview">{proposedDates.slice(0, 8).map(at => <span key={at}>{dateFR(at, { weekday: 'short', day: 'numeric', month: 'short' })} · {timeFR(at)}</span>)}{proposedDates.length > 8 && <span>+{proposedDates.length - 8} autres</span>}{!proposedDates.length && <small>Sélectionnez au moins un jour.</small>}</div></div>
        <div className="field-label"><span>Destinations autorisées <span>*</span></span><div className="n6-select-head"><small>{destinationIds.length} sélectionnée(s)</small></div><div className="group-check-list">{eligible.length ? eligible.map(d => <label key={d.id}><input type="checkbox" checked={destinationIds.includes(d.id)} onChange={() => setDestinationIds(v => toggle(v, d.id))}/><span>{d.name}</span><ShieldCheck size={16}/></label>) : <p className="no-groups">Aucune destination autorisée. Ajoutez-en dans « Destinations ».</p>}</div></div>
        <div className="n6-workload"><CalendarRange size={17}/><div><strong>{workItems} préparation(s) potentielles</strong><small>{announcementIds.length} annonce(s) × {destinationIds.length} destination(s) × {proposedDates.length} créneau(x). Aucun envoi ne sera exécuté.</small></div></div>
        {duplicate && <div className="n5-warning"><AlertTriangle size={17}/> Une autre campagne prévoit au moins une des mêmes annonces vers un même groupe le même jour. Évitez les répétitions non sollicitées.</div>}
        <div className="modal-actions"><button type="button" className="btn btn-secondary" onClick={() => setEditorOpen(false)}>Annuler</button><button type="submit" className="btn btn-primary" disabled={!name.trim() || !announcementIds.length || !destinationIds.length || !proposedDates.length || Date.parse(proposedDates[0]) <= Date.now()}><CheckCircle2 size={16}/>{editingId ? 'Sauvegarder' : 'Préparer la campagne'}</button></div>
      </form>
    </Modal>}
  </>;
}

export default function CampaignsPage() {
  return <Suspense fallback={<div className="page-loader">Chargement…</div>}><CampaignContent/></Suspense>;
}
