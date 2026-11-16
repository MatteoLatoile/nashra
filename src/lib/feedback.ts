export type Tone = 'success' | 'info' | 'warning' | 'error';
export type Notice = { tone: Tone; text: string };

const unreadable = /unexpected (?:token|end of JSON)|not valid JSON|JSON\.parse|<!doctype|<html\b/i;
const uncertain = /incertain|non confirm|pas été confirmé|aucune programmation confirmée/i;
export function readable(value: unknown, fallback: string) {
  const text = value instanceof Error ? value.message : value;
  return typeof text === 'string' && text.trim() && !unreadable.test(text) ? text : fallback;
}

export function campaignFailure(value: unknown): Notice {
  const fallback = 'Résultat inconnu. Vérifiez les messages programmés dans Telegram avant toute nouvelle tentative.';
  const text = value instanceof TypeError || value instanceof SyntaxError ? fallback : readable(value, fallback);
  return { text, tone: text === fallback || uncertain.test(text) || value instanceof TypeError ? 'warning' : 'error' };
}

export function queueNotices(jobs: { status: string; last_error?: string | null }[]): Notice[] {
  const manualSent = jobs.filter(job => job.status === 'sent' && job.last_error?.startsWith('Déclaré envoyé manuellement')).length;
  const manualNotSent = jobs.filter(job => job.status === 'cancelled' && job.last_error?.startsWith('Déclaré non envoyé manuellement')).length;
  const groups: [string[], Tone, string][] = [
    [['blocked','failed'], 'error', 'en échec'],
    [['needs_review'], 'warning', 'à vérifier dans Telegram'],
    [['telegram_scheduled'], 'success', 'programmé(s) sur Telegram'],
    [['sent'], 'success', 'envoi(s) confirmé(s)'],
    [['approved','held','processing'], 'info', 'en attente ou en cours'],
    [['cancelled'], 'info', 'annulé(s)'],
  ];
  return groups.flatMap(([states,tone,label]) => {
    const count = jobs.filter(job => states.includes(job.status) && !(job.status === 'sent' && job.last_error?.startsWith('Déclaré envoyé manuellement')) && !(job.status === 'cancelled' && job.last_error?.startsWith('Déclaré non envoyé manuellement'))).length;
    return count ? [{ tone, text: count + ' ' + label }] : [];
  }).concat(
    manualSent ? [{ tone: 'info' as const, text: `${manualSent} déclaré(s) envoyé(s) manuellement (non certifié(s) par Telegram)` }] : [],
    manualNotSent ? [{ tone: 'info' as const, text: `${manualNotSent} déclaré(s) non envoyé(s) manuellement` }] : [],
  );
}
