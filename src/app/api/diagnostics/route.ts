/** Nashra V3.1 — read-only diagnostics. No session, token, message or chat ID in the response. */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { readiness } from '@/lib/automation/readiness';
import type { Workspace } from '@/lib/automation/readiness';
import { attentionReason } from '@/lib/automation/attention';

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
      publishing: process.env.NASHRA_AUTOMATION_ENABLED === '1' && process.env.NASHRA_PUBLISHING_ENABLED === '1',
      stripeTest: Boolean(process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') && process.env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_')),
      billing: process.env.NASHRA_BILLING_ENABLED === '1',
    };
    const [workspaceRes, telegramRes, queueRes, billingRes, guardRes, reliabilityRes] = await Promise.allSettled([
      db.from('workspaces').select('data').eq('user_id', user.id).maybeSingle(),
      db.from('telegram_accounts').select('session_ciphertext').eq('user_id', user.id).maybeSingle(),
      db.from('delivery_queue').select('status,scheduled_at,attempted_at').eq('user_id', user.id)
        .order('scheduled_at', { ascending: false }).limit(500),
      db.from('nashra_subscriptions').select('status').eq('user_id', user.id).maybeSingle(),
      db.rpc('nashra_v31_guard_version'),
      db.rpc('nashra_v32_migration_ready'),
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
    checks.push(check('worker', configuration.worker ? 'ok' : 'warning',
      configuration.worker ? 'Secrets serveur présents. Cron non exécuté pendant le diagnostic.' :
        'Service role ou secret Cron manquant. Envois automatiques non prêts.'));
    checks.push(check('publishing', configuration.publishing ? 'warning' : 'disabled',
      configuration.publishing ? 'Deux flags de publication actifs : vérifier le Cron et les autorisations.' : 'Publication automatique désactivée.'));
    checks.push(check('billing', configuration.billing && configuration.stripeTest ? 'ok' : 'disabled',
      configuration.billing && configuration.stripeTest ? 'Stripe test configuré. Aucun paiement déclenché.' :
        'Facturation test désactivée ou incomplète.', '/abonnement'));
    // Storage requires a signed write or elevated bucket privileges; do not claim it is ready.
    checks.push(check('storage', 'warning', 'Stockage photo non testé ici. Vérifier avec une image non sensible.', '/annonces'));
    return NextResponse.json({ generatedAt: new Date().toISOString(), checks, campaignStats,
      readOnly: true, noTelegramRequests: true, noWrites: true }, { headers });
  } catch {
    return NextResponse.json({ error: 'Diagnostic indisponible. Vérifiez votre connexion et la configuration Supabase.' }, { status: 503, headers });
  }
}
