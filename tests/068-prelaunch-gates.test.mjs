import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../src/' + path, import.meta.url), 'utf8');
const checkout = read('app/api/billing/checkout/route.ts');
const portal = read('app/api/billing/portal/route.ts');
const result = read('app/api/billing/checkout-result/route.ts');
const webhook = read('app/api/billing/webhook/route.ts');
const onboarding = read('app/bienvenue/onboarding-flow.tsx');
const billing = read('app/api/billing/status/route.ts');
const native = read('app/api/automation/native-schedule/route.ts');
const secure = read('lib/nashra-bundle/secure.ts');

test('068 / origine Stripe : checkout et portail exigent une origine navigateur conforme', () => {
  assert.match(checkout, /sameOrigin\(req\)/);
  assert.match(checkout, /requestOrigin !== origin/);
  assert.match(portal, /sameOrigin\(req\)/);
  assert.match(portal, /req\.headers\.get\('origin'\) !== origin/);
  assert.doesNotMatch(portal, /req\.nextUrl\.origin !== origin/);
});
test('068 / Stripe : sessions de paiement pour un utilisateur authentifié', () => {
  assert.match(checkout, /await session\(\)/);
  assert.match(checkout, /client_reference_id: s\.user\.id/);
  assert.match(checkout, /'metadata\[nashra_user_id\]': s\.user\.id/);
  assert.match(checkout, /idempotencyKey/);
});
test('068 / paiement : la redirection ne débloque jamais seule un plan', () => {
  assert.match(result, /checkout\.client_reference_id !== signedIn\.user\.id/);
  assert.match(result, /getEffectivePlan\(signedIn\.user\.id\)/);
  assert.match(result, /activeInDb/);
});
test('068 / webhook : signature et mode de facturation contrôlés', () => {
  assert.match(webhook, /verifyStripeSignature\(/);
  assert.match(webhook, /event\.livemode !== \(mode === 'live'\)/);
  assert.match(webhook, /nashra_apply_subscription_event_v2/);
});
test('068 / webhook : échecs transitoires renvoyés avec code 500 pour une relance Stripe', () => {
  assert.match(webhook, /Stripe réessaiera/);
  assert.match(webhook, /status: 500/);
});
test('068 / portail : le client Stripe provient du compte connecté', () => {
  assert.match(portal, /\.eq\('user_id', s\.user\.id\)/);
  assert.match(portal, /data\.stripe_livemode !== \(mode === 'live'\)/);
  assert.match(portal, /billing_portal\/sessions/);
});
test('068 / onboarding : statut de connexion et étapes contrôlés', () => {
  assert.match(onboarding, /\/api\/telegram\/user\/status/);
  assert.match(onboarding, /nashra_onboarding_status: 'completed'/);
  assert.match(onboarding, /nashra_onboarding_status: 'skipped'/);
});
test('068 / quotas : réponse vient du snapshot serveur', () => {
  assert.match(billing, /getQuotaSnapshot\(s\.user\.id\)/);
  assert.match(billing, /\.eq\('user_id', s\.user\.id\)/);
});
test('068 / permissions : admin client dépend d’une clé serveur', () => {
  assert.match(secure, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(secure, /auth\.getUser\(\)/);
});
test('068 / Telegram : programmation native conserve les états incertains', () => {
  assert.match(native, /needs_review/);
  assert.match(native, /scheduleWithTelegram\(/);
});
