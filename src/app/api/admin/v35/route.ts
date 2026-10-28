/** Admin only / read-only. Metrics and schema checks without revealing secrets. */
import { NextRequest } from 'next/server';
import { requireAdmin, jsonNoStore, safeMessage } from '@/lib/nashra-admin/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CheckState = 'ok' | 'warning' | 'error' | 'disabled';
type ServiceCheck = { key: string; label: string; state: CheckState; detail: string };
const check = (key: string, label: string, state: CheckState, detail: string): ServiceCheck => ({ key, label, state, detail });
const statuses = ['held','approved','processing','sent','needs_review','blocked','cancelled'] as const;
const permittedOutcomes = ['idle','disabled','sent','blocked','needs_review','error'] as const;
const validHours = (s: string | null) => {
  const n = Number(s || '24');
  return Number.isInteger(n) && n >= 1 && n <= 168 ? n : 24;
};
const n = (value: number | null | undefined) => value ?? 0;

export async function GET(req: NextRequest) {
  const access = await requireAdmin();
  if (access.response) return access.response;
  const db = access.db!;
  const hours = validHours(new URL(req.url).searchParams.get('hours'));
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  try {
    const runsReq = db.from('nashra_worker_runs')
      .select('id,started_at,finished_at,duration_ms,outcome,stalled_flagged,expired_flagged')
      .gte('started_at', since).order('started_at', { ascending:false }).limit(200);
    const latestReq = db.from('nashra_worker_runs').select('started_at,outcome')
      .order('started_at',{ ascending:false }).limit(1);
    const queryStatus = statuses.map(status =>
      db.from('delivery_queue').select('id', { count:'exact', head:true }).eq('status', status));
    const [runs, latest, queue, queueSchema, entitlements, subscriptions, adminCases, securityGuard, reliability] = await Promise.all([
      runsReq, latestReq, Promise.all(queryStatus),
      db.from('delivery_queue').select('attempted_at,finished_at').limit(0),
      db.from('nashra_entitlements').select('user_id').limit(0),
      db.from('nashra_subscriptions').select('user_id').limit(0),
      db.from('nashra_admin_cases').select('id').limit(0),
      db.rpc('nashra_v31_guard_version'),
      db.rpc('nashra_v32_migration_ready'),
    ]);
    const cfg = {
      publishing: process.env.NASHRA_AUTOMATION_ENABLED === '1' && process.env.NASHRA_PUBLISHING_ENABLED === '1',
      cronSecret: (process.env.CRON_SECRET?.length || 0) >= 32,
      serviceKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      stripeTest: process.env.NASHRA_BILLING_ENABLED === '1' &&
        Boolean(process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') && process.env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_')),
    };
    const newest = latest.data?.[0]?.started_at || null;
    const lastAge = newest ? (Date.now() - Date.parse(newest)) / 60000 : null;
    const checks: ServiceCheck[] = [
      check('storage','Journal du worker', runs.error || latest.error ? 'error':'ok',
        runs.error || latest.error ? 'SQL 011 manquant ou inaccessible.' : 'Journal chiffré par transport, sans identifiants de messages ni sessions.'),
      check('queue','Schéma de la file', queueSchema.error || queue.some(x=>x.error) ? 'error':'ok',
        queueSchema.error || queue.some(x=>x.error) ? 'Vérifiez SQL 004 et SQL 005 (attempted_at).' : 'Colonnes de suivi accessibles.'),
      check('entitlements','Quotas', entitlements.error ? 'error':'ok',
        entitlements.error ? 'Migration SQL 009 indisponible.' : 'Table des quotas accessible.'),
      check('billing','Abonnements', subscriptions.error ? 'error':'ok',
        subscriptions.error ? 'Migration SQL 006 indisponible.' : 'Stockage des abonnements accessible.'),
      check('admin','Administration', adminCases.error ? 'error':'ok',
        adminCases.error ? 'Migration SQL 010 indisponible.' : 'Dossiers administrateurs accessibles.'),
      check('guard','Protections des transitions', securityGuard.error || securityGuard.data !== true ? 'warning':'ok',
        securityGuard.error || securityGuard.data !== true ? 'SQL 007 à vérifier.' : 'Contrôles de transition disponibles.'),
      check('reconciliation','Réconciliation', reliability.error || reliability.data !== true ? 'warning':'ok',
        reliability.error || reliability.data !== true ? 'SQL 008 à vérifier.' : 'Fonction de réconciliation disponible.'),
      check('server','Configuration serveur', cfg.serviceKey && cfg.cronSecret ? 'ok':'warning',
        cfg.serviceKey && cfg.cronSecret ? 'Secrets nécessaires présents (valeurs masquées).' : 'Secret Cron ou service_role absent.'),
      check('cron','Dernière exécution du Cron', !cfg.publishing ? 'disabled' : runs.error || !newest ? 'warning' :
        lastAge !== null && lastAge <= 15 ? 'ok' : 'warning',
        !cfg.publishing ? 'Publications désactivées : aucun suivi de disponibilité exigé.' :
        !newest ? 'Aucune exécution enregistrée. Vérifiez Cron et SQL 011.' :
        lastAge !== null && lastAge <= 15 ? 'Une exécution a été enregistrée récemment.' : 'Dernière exécution ancienne : vérifiez la planification Cron.'),
      check('stripe','Stripe en mode test', cfg.stripeTest ? 'ok':'disabled',
        cfg.stripeTest ? 'Mode test configuré, aucun paiement lancé par cette page.' : 'Paiements test désactivés.'),
    ];
    const rows = runs.error ? [] : (runs.data || []);
    const outcomes: Record<string,number> = Object.fromEntries(permittedOutcomes.map(x=>[x,0]));
    for (const row of rows) if (row.outcome in outcomes) outcomes[row.outcome]++;
    return jsonNoStore({
      generatedAt: new Date().toISOString(), hours, checks,
      lastRunAt: newest, partialHistory: rows.length === 200,
      history: rows,
      summary: { attemptsRecorded: rows.length, sent: outcomes.sent, incidents: outcomes.error + outcomes.needs_review + outcomes.blocked,
        averageDurationMs: rows.length ? Math.round(rows.reduce((a,r)=>a+r.duration_ms,0)/rows.length) : 0,
        outcomes, queue: Object.fromEntries(queue.map((x,i)=>[statuses[i],n(x.count)])) },
      readOnly: true, publishingEnabled: cfg.publishing,
      disclaimer: 'Mesures des invocations du Cron, pas une garantie de livraison Telegram. Aucun renvoi automatique.',
    });
  } catch(error) { return safeMessage(error); }
}
