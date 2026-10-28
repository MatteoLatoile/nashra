import 'server-only';
import { adminDb } from '@/lib/nashra-bundle/secure';

/** Telemetry is best-effort. NEVER retry delivery as a consequence of log failures. */
type WorkerOutcome = 'idle' | 'disabled' | 'sent' | 'blocked' | 'needs_review' | 'error';
const allowed = new Set<WorkerOutcome>(['idle','disabled','sent','blocked','needs_review','error']);

function asCount(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? Math.min(1000000, value) : 0;
}
export async function recordWorkerRun(args: {
  state: string;
  startedAt: number;
  reconciliation?: { stalledFlagged?: unknown; expiredFlagged?: unknown } | null;
}): Promise<void> {
  try {
    const state = allowed.has(args.state as WorkerOutcome) ? args.state as WorkerOutcome : 'error';
    const completed = Date.now();
    const started = Number.isFinite(args.startedAt) && args.startedAt > 0 && args.startedAt <= completed
      ? args.startedAt : completed;
    const { error } = await adminDb().from('nashra_worker_runs').insert({
      started_at: new Date(started).toISOString(),
      finished_at: new Date(completed).toISOString(),
      duration_ms: Math.min(3600000, Math.max(0, completed - started)),
      outcome: state,
      stalled_flagged: asCount(args.reconciliation?.stalledFlagged),
      expired_flagged: asCount(args.reconciliation?.expiredFlagged),
    });
    if (error && process.env.NODE_ENV !== 'production') {
      console.warn('[Nashra] Journal du cron indisponible (SQL 011 ?).');
    }
  } catch {
    if (process.env.NODE_ENV !== 'production') console.warn('[Nashra] Journal du cron non accessible.');
  }
}
