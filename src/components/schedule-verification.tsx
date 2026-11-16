'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCheck, ChevronDown, CircleHelp, LoaderCircle, RefreshCw } from 'lucide-react';
import { useConfirm } from '@/components/confirm-dialog';

export type VerificationJob = {
  id: string; destination_id: string; status: string; scheduled_at: string;
  last_error?: string | null; telegram_message_id?: number | null;
  telegram_scheduled_ids?: number[] | null; attempted_at?: string | null;
};
type Check = { jobId: string; status: 'scheduled' | 'partial' | 'missing' | 'possible' | 'unknown' | 'error'; detail: string };
const reviewStatuses = ['needs_review', 'telegram_scheduled', 'processing'];
// One browser tab should not launch a Telegram scan for every campaign on every
// 30-second workspace refresh. Manual checks remain available at all times.
const AUTO_COOLDOWN_MS = 10 * 60_000;
const AUTO_WINDOW_MS = 10 * 60_000;
const MAX_AUTO_CHECKS_PER_WINDOW = 3;
const autoCheckedAt = new Map<string, number>();
const autoAttempts: number[] = [];
function claimAutomaticCheck(campaignId: string, now: number): boolean {
  if (now - (autoCheckedAt.get(campaignId) ?? 0) < AUTO_COOLDOWN_MS) return false;
  while (autoAttempts.length && now - autoAttempts[0] >= AUTO_WINDOW_MS) autoAttempts.shift();
  if (autoAttempts.length >= MAX_AUTO_CHECKS_PER_WINDOW) return false;
  autoCheckedAt.set(campaignId, now);
  autoAttempts.push(now);
  return true;
}
const pretty = (date: string) => Number.isFinite(Date.parse(date))
  ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date))
  : 'Date inconnue';

function readableStatus(job: VerificationJob, checked?: Check): string {
  if (checked?.status === 'scheduled') return 'Encore programmé sur Telegram';
  if (checked?.status === 'partial') return 'Présence partielle sur Telegram';
  if (checked?.status === 'missing') return 'Absent des programmations Telegram';
  if (checked?.status === 'possible') return 'Correspondance possible';
  if (checked?.status === 'error') return 'Contrôle impossible';
  if (checked?.status === 'unknown') return 'État non confirmé';
  if (job.status === 'processing') return 'Envoi à contrôler';
  if (Date.parse(job.scheduled_at) < Date.now()) return 'Envoi passé, état inconnu';
  return 'Programmation à confirmer';
}

export function ScheduleVerification({ campaignId, jobs, destinations, originalHandles, onChanged }: {
  campaignId: string; jobs: readonly VerificationJob[];
  destinations: Readonly<Record<string, string>>;
  originalHandles?: Readonly<Record<string, string | undefined>>;
  onChanged: () => Promise<void>;
}) {
  const confirm = useConfirm();
  const [checking, setChecking] = useState(false);
  const checkingLock = useRef(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, Check>>({});
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setResults({});
    setFeedback(null);
    setExpanded(false);
    setLastCheckedAt(null);
  }, [campaignId]);

  const affected = useMemo(() => jobs.filter(job =>
    reviewStatuses.includes(job.status) &&
    (job.status !== 'telegram_scheduled' || Date.parse(job.scheduled_at) < Date.now()),
  ).sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at)), [jobs]);

  // Background verification is read-only. Limit it to three campaigns per
  // 10 minutes per browser tab, and only when the calendar is visible.
  useEffect(() => {
    if (!affected.length) return;
    if (document.hidden || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
    const timer = window.setTimeout(() => {
      if (!document.hidden && claimAutomaticCheck(campaignId, Date.now())) void check(true);
    }, 700);
    return () => window.clearTimeout(timer);
    // A changed count can mean a job was resolved, but cooldown prevents loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, affected.length]);

  if (!affected.length) return null;

  const labelFor = (id: string) => destinations[id] || originalHandles?.[id] || 'Destination indisponible';
  const busy = checking || resolving !== null;

  async function request(payload: Record<string, unknown>) {
    const response = await fetch('/api/automation/verify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId, ...payload }),
    });
    const json = await response.json() as {
      ok?: boolean; error?: string; message?: string; results?: Check[]; partial?: boolean;
    };
    if (!response.ok || !json.ok) throw new Error(json.error || 'Vérification indisponible.');
    return json;
  }

  async function check(automatic = false) {
    if (checkingLock.current || resolving !== null) return;
    checkingLock.current = true;
    setChecking(true);
    setFeedback(null);
    try {
      const info = await request({ action: 'check' });
      const found = info.results ?? [];
      setResults(Object.fromEntries(found.map(item => [item.jobId, item])));
      setLastCheckedAt(Date.now());
      setFeedback({
        text: info.partial
          ? 'Contrôle partiel. Certains messages n’ont pas pu être consultés.'
          : automatic
            ? 'Contrôle automatique terminé. Les états impossibles à confirmer restent signalés.'
            : `${found.length} envoi${found.length > 1 ? 's' : ''} contrôlé${found.length > 1 ? 's' : ''}. Le détail apparaît ci-dessous.`,
        error: false,
      });
      await onChanged();
    } catch (error) {
      setFeedback({ text: error instanceof Error ? error.message : 'Impossible de consulter Telegram.', error: true });
    } finally {
      checkingLock.current = false;
      setChecking(false);
    }
  }

  async function resolve(job: VerificationJob, action: 'mark_sent' | 'mark_not_sent') {
    if (busy) return;
    const sent = action === 'mark_sent';
    const approved = await confirm({
      title: sent ? 'Confirmer que le message a été envoyé ?' : 'Confirmer que le message n’a pas été envoyé ?',
      description: sent
        ? 'Valide uniquement si tu as retrouvé le message publié dans Telegram. Cette action enregistre ta déclaration et ne publie rien.'
        : 'Valide uniquement après avoir vérifié Telegram. Cette action met à jour le suivi Nashra : elle ne supprime ni ne renvoie de message Telegram.',
      item: `${labelFor(job.destination_id)} · ${pretty(job.scheduled_at)}`,
      confirmText: sent ? 'Oui, je l’ai vu publié' : 'Oui, il n’a pas été envoyé',
      tone: sent ? 'warning' : 'danger',
    });
    if (!approved) return;
    setResolving(job.id);
    setFeedback(null);
    try {
      const info = await request({ action, jobId: job.id, confirmed: true });
      setResults(prev => { const next = { ...prev }; delete next[job.id]; return next; });
      setFeedback({ text: info.message || 'Suivi mis à jour.', error: false });
      await onChanged();
    } catch (error) {
      setFeedback({ text: error instanceof Error ? error.message : 'Enregistrement impossible.', error: true });
    } finally {
      setResolving(null);
    }
  }

  const shown = affected.slice(0, 10);

  return <section className="n48-verification" aria-label="Envois à contrôler" aria-busy={busy}>
    <div className="n52-verification-summary">
      <button type="button" className="n52-detail-toggle" aria-expanded={expanded} onClick={() => setExpanded(v => !v)}>
        <span><strong>{affected.length} message{affected.length > 1 ? 's' : ''} à vérifier</strong>
          <small>{checking ? 'Vérification automatique en cours…' : 'Suivi automatique activé · Aucun renvoi de message'}</small></span>
        {checking ? <LoaderCircle size={16} className="n48-spin" aria-hidden="true" /> : <ChevronDown size={16} className={expanded ? 'n52-chevron-open' : ''} aria-hidden="true" />}
      </button>
    </div>
    {expanded && <div className="n52-verification-detail">
      <button type="button" className="n48-verify-btn" disabled={busy} onClick={() => void check(false)}>
        {checking ? <LoaderCircle size={15} className="n48-spin" aria-hidden="true" /> : <RefreshCw size={15} aria-hidden="true" />}
        {checking ? 'Vérification en cours…' : 'Vérifier maintenant'}
      </button>
      {lastCheckedAt && <p className="n48-job-hint" role="status">Dernier contrôle : {new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(lastCheckedAt)}</p>}
    <div className="n48-job-list">
      {shown.map(job => {
        const checked = results[job.id];
        const ids = Array.isArray(job.telegram_scheduled_ids) && job.telegram_scheduled_ids.length
          ? job.telegram_scheduled_ids
          : typeof job.telegram_message_id === 'number' ? [job.telegram_message_id] : [];
        const canResolve = Number.isFinite(Date.parse(job.scheduled_at)) &&
          Date.now() - Date.parse(job.scheduled_at) >= 30 * 60_000 &&
          checked?.status !== 'scheduled' && checked?.status !== 'partial';
        const resolvingThis = resolving === job.id;
        return <div className="n48-job" key={job.id}>
          <div className="n48-job-top"><strong>{labelFor(job.destination_id)}</strong><span>{readableStatus(job, checked)}</span></div>
          <p className="n48-job-time">Prévu le {pretty(job.scheduled_at)}</p>
          {checked && <p className="n48-job-check"><CircleHelp size={15} aria-hidden="true" />{checked.detail}</p>}
          {!checked && job.status === 'needs_review' &&
            <p className="n48-job-hint">Nashra ne peut pas garantir que ce message a été annulé. Vérifie les messages programmés de ce groupe dans Telegram.</p>}
          {resolvingThis && <p className="n48-progress" role="status"><LoaderCircle size={15} className="n48-spin" aria-hidden="true" />Enregistrement de ta confirmation…</p>}
          {canResolve && <div className="n48-job-actions">
            <button type="button" disabled={busy} onClick={() => void resolve(job, 'mark_sent')}>
              {resolvingThis ? <LoaderCircle size={14} className="n48-spin" /> : <CheckCheck size={14} />}
              Marquer comme envoyé
            </button>
            <button type="button" disabled={busy} onClick={() => void resolve(job, 'mark_not_sent')}>Marquer comme non envoyé</button>
          </div>}
          {!canResolve && <p className="n48-job-hint">
            {checked?.status === 'scheduled' || checked?.status === 'partial'
              ? 'Ce message apparaît encore, entièrement ou en partie, dans Telegram. Ne le marque pas comme envoyé.'
              : 'Les confirmations manuelles sont disponibles 30 minutes après l’heure prévue.'}
          </p>}
          <details className="n48-job-details"><summary><ChevronDown size={13} /> Informations techniques</summary>
            <p>{ids.length ? `Identifiant${ids.length > 1 ? 's' : ''} Telegram : ${ids.join(', ')}` : 'Identifiant Telegram non enregistré.'}</p>
            {job.last_error && <p>Dernière information : {job.last_error}</p>}
            <p>Une déclaration manuelle modifie uniquement le suivi Nashra.</p>
          </details>
        </div>;
      })}
    </div>
    {affected.length > 10 && <p className="n48-job-hint">Affichage limité à 10 messages. Les autres restent enregistrés dans Nashra.</p>}
    </div>}
    {feedback && (feedback.error || expanded) && <p className={`n48-feedback${feedback.error ? ' n48-feedback-error' : ''}`} role="status" aria-live="polite">{feedback.text}</p>}
  </section>;
}
