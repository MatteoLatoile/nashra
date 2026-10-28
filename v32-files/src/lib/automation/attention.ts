/** Read-only classifications, never used to approve or send messages. */
export type ReviewableJob = {
  status: string;
  attempted_at?: string | null;
  scheduled_at?: string | null;
};
export type AttentionReason = 'uncertain' | 'blocked' | 'stalled' | 'expired' | null;
export function attentionReason(job: ReviewableJob, now: number = Date.now()): AttentionReason {
  if (job.status === 'needs_review') return 'uncertain';
  if (job.status === 'blocked') return 'blocked';
  if (job.status === 'processing' && job.attempted_at && Number.isFinite(Date.parse(job.attempted_at)) &&
      now - Date.parse(job.attempted_at) >= 15 * 60_000) return 'stalled';
  if (job.status === 'approved' && job.scheduled_at && Number.isFinite(Date.parse(job.scheduled_at)) &&
      now - Date.parse(job.scheduled_at) >= 24 * 60 * 60_000) return 'expired';
  return null;
}
