/** Server-side only. Converts uncertain states to MANUAL REVIEW, never retries or sends. */
import 'server-only';
import { adminDb } from '@/lib/nashra-bundle/secure';

export type Reconciliation = { stalledFlagged: number; expiredFlagged: number };

export async function reconcileQueue(): Promise<Reconciliation> {
  const { data, error } = await adminDb().rpc('nashra_v32_reconcile_queue');
  if (error) {
    console.error('[Nashra Reconciliation] Supabase RPC error:', {
      code: error.code,
      message: error.message,
    });
    throw new Error('Reconciliation SQL indisponible.');
  }
  const result = data as Partial<Reconciliation> | null;
  if (!result || !Number.isSafeInteger(result.stalledFlagged) ||
      !Number.isSafeInteger(result.expiredFlagged)) {
    throw new Error('Invalid SQL reconciliation result.');
  }
  return { stalledFlagged: result.stalledFlagged!, expiredFlagged: result.expiredFlagged! };
}
