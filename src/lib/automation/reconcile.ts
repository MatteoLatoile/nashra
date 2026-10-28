/** Server-side only. Converts uncertain states to MANUAL REVIEW, never retries or sends. */
import 'server-only';
import { adminDb } from '@/lib/nashra-bundle/secure';

export type Reconciliation = { stalledFlagged: number; expiredFlagged: number };

export async function reconcileQueue(): Promise<Reconciliation> {
  const { data, error } = await adminDb().rpc('nashra_v32_reconcile_queue');
  if (error) throw new Error('Nashra V3.2 migration SQL 008 missing or reconciliation unavailable.');
  const result = data as Partial<Reconciliation> | null;
  if (!result || !Number.isSafeInteger(result.stalledFlagged) ||
      !Number.isSafeInteger(result.expiredFlagged)) {
    throw new Error('Invalid SQL reconciliation result.');
  }
  return { stalledFlagged: result.stalledFlagged!, expiredFlagged: result.expiredFlagged! };
}
