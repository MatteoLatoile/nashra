/** Export editorial reminders; this module NEVER sends Telegram messages. */
import type { AppData, Campaign } from '@/lib/store';

function escapeIcs(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}
function stamp(date: Date): string { return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z'); }
function foldIcs(line: string): string {
  // Folds lines by UTF-8 bytes, avoiding splitting multibyte characters.
  const chunks: string[] = [];
  let part = '';
  for (const ch of line) {
    if (BufferByteLength(part + ch) > 73) { chunks.push(part); part = ' ' + ch; }
    else part += ch;
  }
  chunks.push(part);
  return chunks.join('\r\n');
}
function BufferByteLength(value: string): number { return new TextEncoder().encode(value).length; }
export function buildCalendar(data: AppData, now = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Nashra//Editorial Calendar 2.0//FR',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Nashra — planification éditoriale',
  ];
  const created = stamp(now);
  const campaigns: Campaign[] = data.campaigns.filter(c => c.status === 'scheduled');
  for (const campaign of campaigns) {
    const slots = campaign.scheduledDates?.length ? campaign.scheduledDates : [campaign.scheduledAt];
    const ads = (campaign.announcementIds?.length ? campaign.announcementIds : [campaign.announcementId])
      .map(id => data.announcements.find(a => a.id === id)?.title || 'Annonce supprimée');
    const destinations = campaign.destinationIds.map(id => data.destinations.find(d => d.id === id)?.name || 'Destination supprimée');
    for (const [index, iso] of slots.entries()) {
      const date = new Date(iso);
      if (!Number.isFinite(date.getTime()) || date.getTime() < now.getTime()) continue;
      const end = new Date(date.getTime() + 15 * 60000);
      const uid = `${campaign.id.replace(/[^a-zA-Z0-9_-]/g, '')}-${index}@nashra.local`;
      const details = `Rappel de préparation — aucune publication automatique.\nAnnonces : ${ads.join(', ')}\nDestinations autorisées : ${destinations.join(', ')}\nMode : ${campaign.method === 'forward' ? 'Transfert' : 'Republication'}`;
      lines.push('BEGIN:VEVENT', `UID:${escapeIcs(uid)}`, `DTSTAMP:${created}`,
        `DTSTART:${stamp(date)}`, `DTEND:${stamp(end)}`, `SUMMARY:${escapeIcs(`Nashra · ${campaign.name}`)}`,
        `DESCRIPTION:${escapeIcs(details)}`, 'STATUS:CONFIRMED', 'END:VEVENT');
    }
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldIcs).join('\r\n') + '\r\n';
}
export function downloadCalendar(data: AppData): boolean {
  const text = buildCalendar(data);
  if (!text.includes('BEGIN:VEVENT')) return false;
  const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = 'nashra-planning.ics';
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return true;
}
