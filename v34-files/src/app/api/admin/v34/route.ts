import { NextRequest } from 'next/server';
import { finitePage, jsonNoStore, requireAdmin, safeMessage } from '@/lib/nashra-admin/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const statuses = ['held','approved','processing','sent','needs_review','blocked','cancelled'] as const;
const asInt = (n: number | null) => n ?? 0;

/** Admin-only, read-only data. No Telegram sessions, API secrets or announcement contents returned. */
export async function GET(request: NextRequest) {
  const access = await requireAdmin();
  if (access.response) return access.response;
  const db = access.db!;
  const tab = new URL(request.url).searchParams.get('tab') ?? 'overview';
  const page = finitePage(new URL(request.url).searchParams.get('page'));
  try {
    if (tab === 'overview') {
      const days = Array.from({ length: 7 }, (_, idx) => {
        const d = new Date();
        d.setUTCHours(0,0,0,0); d.setUTCDate(d.getUTCDate() - (6 - idx));
        return d.toISOString();
      });
      const [users, tiers, active, tg, ...queueResults] = await Promise.all([
        db.auth.admin.listUsers({ page: 1, perPage: 1 }),
        db.from('nashra_entitlements').select('tier'),
        db.from('nashra_subscriptions').select('user_id', { head:true, count:'exact' }).in('status', ['active','trialing']),
        db.from('telegram_accounts').select('user_id', { head:true, count:'exact' }),
        ...statuses.map(status => db.from('delivery_queue').select('id', { head:true, count:'exact' }).eq('status', status)),
      ]);
      if (users.error || tiers.error || active.error || tg.error || queueResults.some(x => x.error)) throw new Error('Statistics query failed');
      const tierCounts = { free: 0, pro: 0, business: 0 };
      for (const row of tiers.data || []) {
        const tier = row.tier as keyof typeof tierCounts;
        if (tier in tierCounts) tierCounts[tier]++;
      }
      const trendResults = await Promise.all(days.map(async (day, idx) => {
        const next = idx < days.length - 1 ? days[idx + 1] : new Date(new Date(day).getTime() + 86400000).toISOString();
        const result = await db.from('delivery_queue').select('id', { head:true, count:'exact' })
          .gte('created_at',day).lt('created_at',next);
        if (result.error) throw result.error;
        return { date: day.slice(0,10), total: asInt(result.count) };
      }));
      return jsonNoStore({ tab, totalUsers: users.data?.total ?? 0,
        telegramAccounts: asInt(tg.count), activeSubscriptions: asInt(active.count),
        tiers: tierCounts, trend: trendResults,
        queue: Object.fromEntries(queueResults.map((r,i) => [statuses[i], asInt(r.count)])),
        publishingEnabled: process.env.NASHRA_AUTOMATION_ENABLED === '1' && process.env.NASHRA_PUBLISHING_ENABLED === '1',
        billingTestEnabled: process.env.NASHRA_BILLING_ENABLED === '1' && (process.env.STRIPE_SECRET_KEY || '').startsWith('sk_test_'),
        generatedAt: new Date().toISOString(),
      });
    }
    if (tab === 'users') {
      const response = await db.auth.admin.listUsers({ page, perPage: 25 });
      if (response.error) throw response.error;
      const users = response.data?.users || [];
      const ids = users.map(u => u.id);
      if (!ids.length) return jsonNoStore({ tab, page, total: response.data?.total || 0, users: [] });
      const [tiers, subscriptions, jobs] = await Promise.all([
        db.from('nashra_entitlements').select('user_id,tier').in('user_id',ids),
        db.from('nashra_subscriptions').select('user_id,status,current_period_end').in('user_id',ids),
        db.from('delivery_queue').select('user_id,status').in('user_id',ids).in('status',['held','approved','processing']),
      ]);
      if (tiers.error || subscriptions.error || jobs.error) throw new Error('User lookup failed');
      const t = new Map((tiers.data || []).map(x => [x.user_id, x.tier]));
      const s = new Map((subscriptions.data || []).map(x => [x.user_id, x]));
      const q = new Map<string,number>();
      for (const item of jobs.data || []) q.set(item.user_id, (q.get(item.user_id) ?? 0)+1);
      return jsonNoStore({ tab, page, total: response.data?.total ?? users.length,
        users: users.map(u => ({ id:u.id, email:u.email ?? null, createdAt:u.created_at,
          lastSignIn:u.last_sign_in_at || null, confirmed: Boolean(u.email_confirmed_at || u.confirmed_at),
          tier: t.get(u.id) || 'free', subscription:s.get(u.id)?.status || 'free',
          periodEnd:s.get(u.id)?.current_period_end || null, pending: q.get(u.id) || 0,
        })) });
    }
    if (tab === 'billing') {
      const { data, error } = await db.from('nashra_subscriptions')
        .select('user_id,status,price_id,current_period_end,cancel_at_period_end,updated_at')
        .order('updated_at',{ ascending:false }).range((page-1)*30,page*30-1);
      if (error) throw error;
      const { count, error: countError } = await db.from('nashra_subscriptions').select('user_id',{count:'exact',head:true});
      if (countError) throw countError;
      return jsonNoStore({ tab,page,total:asInt(count), subscriptions:data || [], testMode:true });
    }
    if (tab === 'incidents') {
      const { data, error } = await db.from('delivery_queue')
        .select('id,user_id,status,scheduled_at,attempted_at,finished_at,last_error,created_at')
        .in('status',['needs_review','blocked','processing'])
        .order('created_at',{ascending:false}).range((page-1)*30,page*30-1);
      if (error) throw error;
      const { count, error: countError } = await db.from('delivery_queue')
        .select('id',{count:'exact',head:true}).in('status',['needs_review','blocked','processing']);
      if (countError) throw countError;
      const ids = (data || []).map(x => x.id);
      const cases = ids.length ? await db.from('nashra_admin_cases')
        .select('id,queue_id,status,note,updated_at').in('queue_id',ids) : { data: [], error:null };
      if (cases.error) throw cases.error;
      return jsonNoStore({tab,page,total:asInt(count),incidents:data || [],cases:cases.data || []});
    }
    if (tab === 'audit') {
      const { data, error } = await db.from('nashra_admin_audit')
        .select('id,actor_id,action,target_id,details,created_at')
        .order('created_at',{ascending:false}).range((page-1)*30,page*30-1);
      if (error) throw error;
      const { count, error: countError } = await db.from('nashra_admin_audit').select('id',{count:'exact',head:true});
      if (countError) throw countError;
      return jsonNoStore({tab,page,total:asInt(count),entries:data || []});
    }
    return jsonNoStore({error:'Section inconnue.'},400);
  } catch (error) { return safeMessage(error); }
}
