import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const landing = readFileSync(new URL('../src/app/page.tsx', import.meta.url), 'utf8');
const diagnostic = readFileSync(new URL('../src/app/api/diagnostics/route.ts', import.meta.url), 'utf8');
const help = readFileSync(new URL('../src/app/aide/page.tsx', import.meta.url), 'utf8');
const settings = readFileSync(new URL('../src/app/(dashboard)/parametres/page.tsx', import.meta.url), 'utf8');
const limits = readFileSync(new URL('../supabase/025_plan_limits_044.sql', import.meta.url), 'utf8');
test('071: public business claims match enforced quotas', () => {
  assert.match(landing, /groups: 30, sends: '2 000', scheduled: 300/);
  assert.match(diagnostic, /business: \[1, 30, 2000, 300\]/);
  assert.match(limits, /\('business',\s*1,\s*30,\s*2000,\s*300\)/);
  assert.doesNotMatch(landing, /groups: 100, sends: '5 000'/);
});
test('071: no unsupported priority support promise', () => {
  assert.doesNotMatch(landing, /Support prioritaire/);
});
test('071: help center accessible from landing and settings', () => {
  assert.match(landing, /href="\/aide"/);
  assert.match(settings, /href="\/aide"/);
  assert.match(help, /export default function HelpPage/);
});
test('071: help center does not expose credentials or trigger Telegram sends', () => {
  assert.match(help, /Ne transmettez jamais/);
  assert.doesNotMatch(help, /publish-announcement|schedule-message|service_role|STRIPE_SECRET_KEY/);
});
test('071: support contact is shown only with configured email', () => {
  assert.match(help, /NEXT_PUBLIC_NASHRA_SUPPORT_EMAIL/);
  assert.match(help, /supportEmail \?/);
  assert.doesNotMatch(help, /contact@usenashra.com|support@usenashra.com/);
});
test('071: no legal page published with unverified issuer data', () => {
  assert.doesNotMatch(landing, /href="\/(cgu|mentions-legales|confidentialite)"/);
});
