/** Server-only facade for SQL 015. Quotas are checked in PostgreSQL transactions. */
import 'server-only';
import { adminDb } from '@/lib/nashra-bundle/secure';

export type QuotaPlan = {
  plan_slug: 'free' | 'pro' | 'business'; max_telegram_accounts: number;
  max_active_groups: number; max_monthly_sends: number;
  max_pending_schedules: number; priority_support: boolean;
};

export function quotaError(error: unknown): string {
  const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error);
  if (/NASHRA_MONTHLY_SEND_QUOTA_EXCEEDED/.test(message)) return 'Limite mensuelle d’envois atteinte. Consultez /abonnement.';
  if (/NASHRA_PENDING_SCHEDULE_QUOTA_EXCEEDED/.test(message)) return 'Limite de programmations en attente atteinte. Consultez /abonnement.';
  if (/NASHRA_ACTIVE_GROUP_QUOTA_EXCEEDED/.test(message)) return 'Limite de groupes actifs atteinte. Consultez /abonnement.';
  if (/NASHRA_IDEMPOTENCY_CONFLICT|NASHRA_RESERVATION_ALREADY_RELEASED/.test(message)) return 'Demande déjà traitée. Consultez l’historique avant de réessayer.';
  return 'Quotas indisponibles. Vérifiez les migrations SQL 015 et 016.';
}

export async function getEffectivePlan(userId: string): Promise<QuotaPlan> {
  const { data, error } = await adminDb().rpc('nashra_effective_plan', { p_user_id: userId });
  if (error || !Array.isArray(data) || !data[0]) throw new Error(quotaError(error));
  return data[0] as QuotaPlan;
}

/** 1 reservation per announcement/destination. Call before any Telegram side effect. */
export async function reserveSend(input: {
  userId: string; key: string; announcementId: string; destinationId: string; scheduledAt: string;
}): Promise<string> {
  const { data, error } = await adminDb().rpc('nashra_reserve_one_send', {
    p_user_id: input.userId, p_idempotency_key: input.key,
    p_announcement_id: input.announcementId, p_destination_id: input.destinationId,
    p_scheduled_at: input.scheduledAt,
  });
  if (error || typeof data !== 'string') throw new Error(quotaError(error));
  return data;
}

/** Created flag is serialized in SQL 016, so cleanup never releases an older booking. */
export async function reserveSendWithOrigin(input: {
  userId: string; key: string; announcementId: string; destinationId: string; scheduledAt: string;
}): Promise<{ id: string; created: boolean }> {
  const { data, error } = await adminDb().rpc('nashra_reserve_send_with_origin', {
    p_user_id: input.userId, p_idempotency_key: input.key,
    p_announcement_id: input.announcementId, p_destination_id: input.destinationId,
    p_scheduled_at: input.scheduledAt,
  });
  if (error || !Array.isArray(data) || typeof data[0]?.reservation_id !== 'string')
    throw new Error(quotaError(error));
  return { id: data[0].reservation_id, created: data[0].newly_created === true };
}

/** 'confirmed' only after Telegram returns a real message ID, or another verified proof. */
export async function finalizeSend(userId: string, reservationId: string, outcome: 'confirmed' | 'uncertain' | 'released') {
  const { error } = await adminDb().rpc('nashra_finalize_one_send', {
    p_user_id: userId, p_reservation_id: reservationId, p_outcome: outcome,
  });
  if (error) throw new Error('Impossible de finaliser le compteur. Vérification manuelle nécessaire.');
}

export async function releaseIfNeverSubmitted(userId: string, reservationId: string) {
  await finalizeSend(userId, reservationId, 'released');
}

export type QuotaUsage = {
  telegramAccounts: { used: number; limit: number };
  activeGroups: { used: number; limit: number };
  monthlySends: { used: number; confirmed: number; limit: number; monthUtc: string };
  pendingSchedules: { used: number; limit: number };
};
export type PlanCatalogRow = {
  slug: 'free' | 'pro' | 'business'; monthly_price_usd_cents: number;
  annual_price_usd_cents: number; max_telegram_accounts: number;
  max_active_groups: number; max_monthly_sends: number;
  max_pending_schedules: number; priority_support: boolean;
};
/** Read-only snapshot. PostgreSQL guards remain the authority, never these numbers. */
export async function getQuotaSnapshot(userId: string): Promise<{
  tier: QuotaPlan['plan_slug']; usage: QuotaUsage; catalog: PlanCatalogRow[];
}> {
  const db = adminDb();
  const first = new Date();
  const utcMonth = `${first.getUTCFullYear()}-${String(first.getUTCMonth()+1).padStart(2,'0')}-01`;
  const [entitlements, groups, account, pending, monthly, catalog] = await Promise.all([
    db.rpc('nashra_effective_plan', { p_user_id: userId }),
    db.from('workspaces').select('data').eq('user_id',userId).maybeSingle(),
    db.from('telegram_accounts').select('session_ciphertext').eq('user_id',userId).maybeSingle(),
    db.from('delivery_queue').select('id',{head:true,count:'exact'}).eq('user_id',userId)
      .not('job_key','like','manual:%').in('status',['held','approved','processing','telegram_scheduled']),
    db.from('nashra_usage_monthly').select('allocated_sends,confirmed_sends')
      .eq('user_id',userId).eq('usage_month',utcMonth).maybeSingle(),
    db.from('nashra_plans').select('slug,monthly_price_usd_cents,annual_price_usd_cents,max_telegram_accounts,max_active_groups,max_monthly_sends,max_pending_schedules,priority_support').order('display_order'),
  ]);
  if (entitlements.error || groups.error || account.error || pending.error || monthly.error || catalog.error || !entitlements.data?.[0]) {
    throw new Error('Quotas indisponibles : vérifiez les migrations SQL 015 et 016.');
  }
  const plan = entitlements.data[0] as QuotaPlan;
  const dests = groups.data?.data?.destinations;
  return {
    tier: plan.plan_slug,
    usage: {
      telegramAccounts: { used: account.data?.session_ciphertext ? 1 : 0, limit: plan.max_telegram_accounts },
      activeGroups: { used: Array.isArray(dests) ? dests.filter((d: { authorized?: unknown }) => d?.authorized === true).length : 0,
        limit: plan.max_active_groups },
      monthlySends: { used: monthly.data?.allocated_sends ?? 0,
        confirmed: monthly.data?.confirmed_sends ?? 0, limit: plan.max_monthly_sends, monthUtc: utcMonth },
      pendingSchedules: { used: pending.count ?? 0, limit: plan.max_pending_schedules },
    },
    catalog: (catalog.data ?? []) as PlanCatalogRow[],
  };
}
