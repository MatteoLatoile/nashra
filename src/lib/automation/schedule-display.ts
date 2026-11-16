/** Presentation only: never use this indicator as proof of Telegram delivery. */
export type ScheduleJob = { status: string; scheduled_at: string; last_error?: string | null };
export type ScheduleView = {
  label: string;
  tone: 'neutral' | 'positive' | 'warn';
  explanation: string | null;
  attention: boolean;
  confirmedFuture: number;
  uncertain: number;
  processing: number;
};

export function scheduleView(input: {
  paused: boolean;
  recurring: boolean;
  nativeTelegram: boolean;
  recurringEnabled: boolean;
  loaded: boolean;
  loading?: boolean;
  jobs: readonly ScheduleJob[];
  ruleProblem?: string | null;
  now: number;
}): ScheduleView {
  const { paused, recurring, nativeTelegram, recurringEnabled, loaded, jobs, ruleProblem, now } = input;
  const future = (job: ScheduleJob) => Number.isFinite(Date.parse(job.scheduled_at)) && Date.parse(job.scheduled_at) > now;
  const confirmedFuture = jobs.filter(j => j.status === 'telegram_scheduled' && future(j)).length;
  const staleScheduled = jobs.filter(j => j.status === 'telegram_scheduled' && !future(j)).length;
  const uncertain = jobs.filter(j => j.status === 'needs_review').length;
  const processing = jobs.filter(j => j.status === 'processing').length;
  const failed = jobs.filter(j => j.status === 'blocked' || j.status === 'failed').length;
  const manualSent = jobs.some(j => j.status === 'sent' && j.last_error?.startsWith('Déclaré envoyé manuellement'));
  const manualNotSent = jobs.some(j => j.status === 'cancelled' && j.last_error?.startsWith('Déclaré non envoyé manuellement'));
  const base = { confirmedFuture, uncertain, processing };

  if (input.loading) return { ...base, label: 'Vérification…', tone: 'neutral', explanation: null, attention: false };
  if (!loaded) return { ...base, label: 'Statut indisponible', tone: 'warn',
    explanation: 'Connexion impossible : actualisez pour connaître l’état des publications Telegram.', attention: true };
  if (paused && confirmedFuture) return { ...base, label: 'Arrêt à vérifier', tone: 'warn',
    explanation: 'La répétition est arrêtée dans Nashra, mais des messages futurs restent enregistrés comme programmés sur Telegram. Vérifiez-les avant de considérer la pause comme complète.', attention: true };
  if (uncertain || processing || staleScheduled) return { ...base, label: 'À vérifier', tone: 'warn',
    explanation: paused ? 'Nashra est en pause, mais certains envois ont un résultat incertain. Vérifiez-les dans Telegram.'
      : 'Certains messages sont en cours, incertains ou passés sans confirmation. Vérifiez Telegram avant de relancer.', attention: true };
  if (failed) return { ...base, label: 'Échec à consulter', tone: 'warn',
    explanation: 'Au moins une publication a été bloquée ou a échoué. Consultez les détails avant de reprogrammer.', attention: true };
  if (paused) return { ...base, label: 'En pause', tone: 'neutral', explanation: ruleProblem || null, attention: Boolean(ruleProblem) };
  if (recurring && !recurringEnabled) return { ...base, label: 'Moteur arrêté', tone: 'warn',
    explanation: 'Le renouvellement des répétitions est désactivé. Les messages déjà programmés sur Telegram peuvent toujours partir.', attention: true };
  if (ruleProblem) return { ...base, label: 'À vérifier', tone: 'warn', explanation: ruleProblem, attention: true };
  if (confirmedFuture) return { ...base, label: recurring ? 'Actif' : 'Programmé', tone: 'positive',
    explanation: null, attention: false };
  if (recurring) return { ...base, label: 'En attente', tone: 'neutral',
    explanation: 'Règle active, mais aucun prochain message Telegram n’est confirmé. Le prochain remplissage doit être vérifié.', attention: false };
  if (jobs.some(j => j.status === 'sent')) return { ...base, label: manualSent ? 'Déclaré envoyé' : 'Terminé', tone: 'neutral', explanation: null, attention: false };
  if (jobs.every(j => j.status === 'cancelled') && jobs.length) return { ...base, label: manualNotSent ? 'Déclaré non envoyé' : 'Annulé', tone: 'neutral', explanation: null, attention: false };
  return { ...base, label: nativeTelegram ? 'En attente de confirmation' : 'En attente', tone: 'neutral',
    explanation: nativeTelegram ? 'Aucun prochain envoi Telegram n’est confirmé pour le moment.' : null, attention: false };
}
