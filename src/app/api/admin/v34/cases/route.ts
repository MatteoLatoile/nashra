import { NextRequest } from 'next/server';
import { isUuid, jsonNoStore, requireAdmin, safeMessage, sameOrigin } from '@/lib/nashra-admin/guards';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const allowed = new Set(['open', 'investigating', 'resolved']);
/** Records an administrative review; never retries, approves or changes a Telegram delivery. */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  if (!sameOrigin(req)) return jsonNoStore({ error:'Origine de la requête refusée.' }, 403);
  if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
    return jsonNoStore({ error:'JSON requis.' },415);
  let input: { queueId?: unknown; status?: unknown; note?: unknown };
  try { input = await req.json(); }
  catch { return jsonNoStore({ error:'Requête JSON invalide.' },400); }
  const queueId = typeof input.queueId === 'string' ? input.queueId : '';
  const status = typeof input.status === 'string' ? input.status : '';
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (!isUuid(queueId) || !allowed.has(status) || note.length < 8 || note.length > 600)
    return jsonNoStore({ error:'Opération, statut ou note invalide (8 à 600 caractères).' },400);
  try {
    const { data, error } = await auth.db!.rpc('nashra_v34_save_case', {
      p_queue_id: queueId, p_status:status, p_note:note, p_actor:auth.current!.user.id,
    });
    if (error) throw error;
    if (!data) return jsonNoStore({ error:'Opération introuvable.' },404);
    return jsonNoStore({ ok:true, caseId:data });
  } catch (error) { return safeMessage(error); }
}
