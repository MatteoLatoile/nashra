import 'server-only';
import { adminDb } from '@/lib/nashra-bundle/secure';

/** Best-effort telemetry: errors here must NEVER cause a Telegram retry. */
type Outcome = 'done' | 'disabled' | 'error';
const nonnegative = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0
  ? Math.min(v, 1_000_000) : 0;

export async function recordRecurringRun(args: {
  startedAt: number;
  outcome: Outcome;
  result?: { rules?: number; scheduled?: number; warnings?: number };
}): Promise<void> {
  try {
    const finished = Date.now();
    const started = Number.isFinite(args.startedAt) && args.startedAt > 0 && args.startedAt <= finished
      ? args.startedAt : finished;
    const db = adminDb();
    const { error } = await db.from('nashra_recurring_cron_runs').insert({
      started_at: new Date(started).toISOString(),
      finished_at: new Date(finished).toISOString(),
      duration_ms: Math.min(3_600_000, finished - started),
      outcome: args.outcome,
      rules_checked: nonnegative(args.result?.rules),
      scheduled_count: nonnegative(args.result?.scheduled),
      warning_count: nonnegative(args.result?.warnings),
    });
    if (error) {
      console.warn('[Nashra recurring] Telemetry unavailable; check SQL 026.');
      return;
    }
    // At most one automatic prune per recurring invocation (normally daily).
    // No RPC or schema change needed; limits free-tier storage growth.
    const cutoff = new Date(finished - 30 * 86_400_000).toISOString();
    await db.from('nashra_recurring_cron_runs').delete().lt('started_at', cutoff);
  } catch {
    console.warn('[Nashra recurring] Telemetry unavailable; no publish retry.');
  }
}
