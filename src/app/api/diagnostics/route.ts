/** Nashra V3.1 — read-only diagnostics. No session, token, message or chat ID in the response. */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { readiness } from '@/lib/automation/readiness';
import type { Workspace } from '@/lib/automation/readiness';
import { attentionReason } from '@/lib/automation/attention';
import { billingMode, configuredPrice } from '@/lib/nashra-bundle/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store, max-age=0' };
type State = 'ok' | 'warning' | 'error' | 'disabled';
type Check = { key: string; state: State; detail: string; action?: string };
const check = (key: string, state: State, detail: string, action?: string): Check => ({ key, state, detail, ...(action ? { action } : {}) });

export async function GET() {
  try {
    const db = await createClient();
    const { data: { user }, error: authError } = await db.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401, headers });
    const checks: Check[] = [];
    const configuration = {
      telegram: Number.isSafeInteger(Number(process.env.TELEGRAM_API_ID)) && Number(process.env.TELEGRAM_API_ID) > 0 &&
        Boolean(process.env.TELEGRAM_API_HASH?.trim()) && /^[a-f0-9]{64}$/i.test(process.env.NASHRA_SESSION_ENCRYPTION_KEY || ''),
      worker: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && (process.env.CRON_SECRET?.length || 0) >= 32),
      publishing: process.env.NASHRA_AUTOMATION_ENABLED === '1' && process.env.NASHRA_PUBLISHING_ENABLED === '1'
        && process.env.NASHRA_DISABLE_ALL_SENDS !== '1',
      recurring: process.env.NASHRA_RECURRING_ENABLED === '1' && process.env.NASHRA_DISABLE_ALL_SENDS !== '1',
    };
    const [workspaceRes, telegramRes, queueRes, billingRes, guardRes, reliabilityRes, plansRes] = await Promise.allSettled([
      db.from('workspaces').select('data').eq('user_id', user.id).maybeSingle(),
      db.from('telegram_accounts').select('session_ciphertext').eq('user_id', user.id).maybeSingle(),
      db.from('delivery_queue').select('status,scheduled_at,attempted_at').eq('user_id', user.id)
        .order('scheduled_at', { ascending: false }).limit(500),
      db.from('nashra_subscriptions').select('status').eq('user_id', user.id).maybeSingle(),
      db.rpc('nashra_v31_guard_version'),
      db.rpc('nashra_v32_migration_ready'),
      db.from('nashra_plans').select('slug,max_telegram_accounts,max_active_groups,max_monthly_sends,max_pending_schedules'),
    ]);

    let campaignStats = { total: 0, ready: 0, blocked: 0 };
    if (workspaceRes.status === 'rejected' || workspaceRes.value.error) {
      checks.push(check('workspace', 'error', 'Espace inaccessible. Vérifiez la migration SQL 001.'));
    } else if (!workspaceRes.value.data?.data) {
      checks.push(check('workspace', 'warning', 'Aucun espace de travail enregistré.', '/annonces'));
    } else {
      const report = readiness(workspaceRes.value.data.data as Workspace);
      campaignStats = { total: report.totals.campaigns, ready: report.totals.ready, blocked: report.totals.blocked };
      checks.push(check('workspace', 'ok', 'Espace disponible.'));
      checks.push(check('campaigns', report.totals.blocked ? 'warning' : 'ok',
        `${report.totals.ready} campagne(s) prête(s), ${report.totals.blocked} à corriger.`, '/automatisation'));
    }
    if (telegramRes.status === 'rejected' || telegramRes.value.error) {
      checks.push(check('telegram', 'error', 'Compte inaccessible. Vérifiez la migration SQL 002.', '/telegram'));
    } else {
      const connected = Boolean(telegramRes.value.data?.session_ciphertext);
      checks.push(check('telegram', !configuration.telegram ? 'error' : connected ? 'ok' : 'warning',
        !configuration.telegram ? 'Paramètres Telegram côté serveur incomplets.' :
          connected ? 'Session chiffrée enregistrée. Connexion réelle non testée.' : 'Compte Telegram à connecter.', '/telegram'));
    }
    if (queueRes.status === 'rejected' || queueRes.value.error) {
      checks.push(check('queue', 'error', 'File inaccessible. Vérifiez les migrations SQL 004 et 005.', '/file-attente'));
    } else {
      const rows = queueRes.value.data || [];
      const now = Date.now();
      const attention = rows.filter(j => attentionReason(j, now) !== null).length;
      checks.push(check('queue', attention ? 'warning' : 'ok', attention ?
        `${attention} opération(s) demandent une vérification manuelle.` : 'Aucune opération problématique parmi les 500 dernières.', '/operations'));
      if (rows.length === 500) checks.push(check('queueLimit', 'warning', 'Audit limité aux 500 tâches les plus récentes.', '/operations'));
    }
    if (guardRes.status === 'rejected' || guardRes.value.error || guardRes.value.data !== true) {
      checks.push(check('migration', 'warning', 'Garde-fou SQL 007 non confirmé. Appliquez la migration avant la production.'));
    } else checks.push(check('migration', 'ok', 'Transitions des tâches protégées par SQL 007.'));
    if (reliabilityRes.status === 'rejected' || reliabilityRes.value.error || reliabilityRes.value.data !== true) {
      checks.push(check('reliability', 'warning', 'Réconciliation SQL 008 absente ou inaccessible. Exécutez la migration 008.', '/supervision'));
    } else checks.push(check('reliability', 'ok', 'Réconciliation SQL 008 disponible. Aucune publication déclenchée.'));
    if (billingRes.status === 'rejected' || billingRes.value.error) {
      checks.push(check('subscription', 'error', 'Abonnements indisponibles. Vérifiez SQL 006.', '/abonnement'));
    } else checks.push(check('subscription', 'ok', 'Lecture de votre abonnement disponible.', '/abonnement'));
    const expectedPlans = {
      free: [1, 3, 30, 5],
      pro: [1, 30, 1000, 150],
      business: [1, 30, 2000, 300],
    } as const;
    if (plansRes.status === 'rejected' || plansRes.value.error || !plansRes.value.data) {
      checks.push(check('plans', 'warning', 'Catalogue des quotas inaccessible : vérifier SQL 015 et 025.', '/abonnement'));
    } else {
      const rows = plansRes.value.data;
      const matches = Object.entries(expectedPlans).every(([slug, expected]) => {
        const plan = rows.find(row => row.slug === slug);
        return plan && [plan.max_telegram_accounts, plan.max_active_groups,
          plan.max_monthly_sends, plan.max_pending_schedules].every((value, index) => value === expected[index]);
      });
      checks.push(check('plans', matches ? 'ok' : 'warning', matches
        ? 'Free, Pro et Business conformes aux limites prévues (SQL 025).'
        : 'Les quotas en base ne correspondent pas aux forfaits : appliquer SQL 025.', '/abonnement'));
    }
    checks.push(check('worker', 'warning', configuration.worker
      ? 'Secrets du moteur présents. Son exécution réelle et les déclencheurs Cron restent à contrôler.'
      : 'Service role ou secret Cron manquant : moteur automatique non prêt.', '/operations'));
    checks.push(check('publishing', configuration.publishing ? 'warning' : 'disabled',
      configuration.publishing
        ? 'Publication activée dans la configuration. Tester le Cron et les autorisations avant tout envoi.'
        : process.env.NASHRA_DISABLE_ALL_SENDS === '1'
          ? 'Envois suspendus par l’interrupteur de sécurité global.'
          : 'Publication automatique désactivée dans la configuration.', '/automatisation'));
    checks.push(check('recurring', configuration.recurring ? 'warning' : 'disabled',
      configuration.recurring
        ? 'Récurrence activée dans la configuration. Vérifier le Cron récurrent et SQL 018.'
        : 'Réapprovisionnement automatique des récurrences désactivé.', '/campagnes'));
    const stripeMode = billingMode();
    if (stripeMode === 'disabled') {
      checks.push(check('billing', 'disabled', 'Facturation Stripe non activée ou configuration incomplète.', '/abonnement'));
    } else {
      const priceCount = (['pro', 'business'] as const).flatMap(tier =>
        (['month', 'year'] as const).map(interval => configuredPrice(tier, interval))
      ).filter(Boolean).length;
      const webhookConfigured = Boolean(process.env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_'));
      const priceStatus = `${priceCount}/4 identifiants de prix configurés`;
      checks.push(check('billing', 'warning',
        `Stripe ${stripeMode === 'live' ? 'production' : 'test'} configuré ; ${priceStatus}${webhookConfigured ? '' : ' ; secret webhook absent'}. ` +
        'Le diagnostic ne contacte pas Stripe et ne valide pas la réception des webhooks.', '/abonnement'));
    }
    // Storage requires a signed write or elevated bucket privileges; do not claim it is ready.
    checks.push(check('storage', 'warning', 'Stockage photo non testé ici. Vérifier avec une image non sensible.', '/annonces'));
    return NextResponse.json({ generatedAt: new Date().toISOString(), checks, campaignStats,
      readOnly: true, noTelegramRequests: true, noWrites: true }, { headers });
  } catch {
    return NextResponse.json({ error: 'Diagnostic indisponible. Vérifiez votre connexion et la configuration Supabase.' }, { status: 503, headers });
  }
}
