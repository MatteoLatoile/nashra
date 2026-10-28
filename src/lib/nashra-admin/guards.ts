import 'server-only';
import { NextResponse } from 'next/server';
import { adminAllowed, adminDb, noStore, session } from '@/lib/nashra-bundle/secure';

/** All credentials stay server-side. This guard must precede any service-role query. */
export async function requireAdmin() {
  const current = await session();
  if (!current) return { response: NextResponse.json({ error: 'Connexion requise.' }, { status: 401, headers: noStore }), current: null, db: null };
  if (!adminAllowed(current.user.id)) return { response: NextResponse.json({ error: 'Accès administrateur refusé.' }, { status: 403, headers: noStore }), current: null, db: null };
  try { return { response: null, current, db: adminDb() }; }
  catch { return { response: NextResponse.json({ error: 'Configuration serveur administrateur incomplète.' }, { status: 503, headers: noStore }), current: null, db: null }; }
}
export function safeMessage(error: unknown) {
  // Never return database details, connection strings or tokens to browsers.
  if (process.env.NODE_ENV !== 'production') console.error('[Nashra admin]', error instanceof Error ? error.message : String(error));
  return NextResponse.json({ error: 'Administration indisponible. Vérifiez SQL 010 et les paramètres serveur.' }, { status: 503, headers: noStore });
}
export const isUuid = (value: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export const finitePage = (value: string | null): number => {
  const n = Number(value ?? 1);
  return Number.isInteger(n) && n >= 1 && n <= 10000 ? n : 1;
};
export function sameOrigin(request: Request): boolean {
  // Mutations use a strict same-origin check, not CORS or browser-side role checks.
  const source = request.headers.get('origin');
  if (!source) return false;
  try {
    const url = new URL(request.url);
    const origin = new URL(source);
    return origin.protocol === url.protocol && origin.host === url.host;
  } catch { return false; }
}
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  // Prevent spreadsheet formula execution when a CSV is opened in Excel.
  if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function csv(rows: unknown[][]) {
  return '\ufeff' + rows.map(row => row.map(csvCell).join(';')).join('\r\n') + '\r\n';
}
export function jsonNoStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: noStore });
}
