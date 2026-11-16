import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('Les badges techniques ne dominent plus les cartes de programmation', () => {
  const page = source('src/app/(dashboard)/campagnes/page.tsx');
  assert.match(page, /scheduleView\(/);
  assert.match(page, /<Badge tone=\{state\.tone\}>/);
  assert.match(page, /Pause à confirmer/);
  assert.match(page, /<details className="n46-details">/);
  assert.match(page, /state\.attention && <div className="n52-compact-warning"/);
  assert.match(page, /<ScheduleVerification campaignId=\{c\.id\}/);
  assert.match(page, /Voir les détails techniques/);
  assert.doesNotMatch(page, /notices\.map\(n => <span/);
});

test('Pause et suppression ciblent la destination Telegram mémorisée, pas la destination modifiée', () => {
  const recurring = source('src/lib/automation/recurring-service.ts');
  const native = source('src/app/api/automation/native-schedule/route.ts');
  assert.match(recurring, /campaign\?\.destinationHandles\?\.\[row\.destination_id\]/);
  assert.match(recurring, /cancelTelegramSchedule\(session,originalChatId/);
  assert.match(native, /campaign\.destinationHandles\?\.\[job\.destination_id\]/);
  assert.match(native, /cancelTelegramSchedule\(account\.session_ciphertext, originalChatId/);
});

test('Les envois futurs incertains empêchent une suppression faussement réussie', () => {
  const service = source('src/lib/automation/recurring-service.ts');
  const api = source('src/app/api/automation/recurring/route.ts');
  assert.match(service, /'telegram_scheduled','needs_review','processing'/);
  assert.match(service, /unverified = rows\.filter/);
  assert.match(api, /canceled\.failures \|\| canceled\.unverified/);
  assert.ok(api.indexOf('canceled.failures || canceled.unverified') < api.indexOf("if (body.action === 'delete')"));
  assert.match(api, /annulation Telegram n’a pas pu être vérifiée/);
});

test('La reprise après incertitude nécessite une déclaration explicite de vérification', () => {
  const page = source('src/app/(dashboard)/campagnes/page.tsx');
  assert.match(page, /J’ai vérifié, reprendre/);
  assert.match(page, /reviewed: existingRecurring && action === 'resume' && reviewedInTelegram/);
});

test('Le correctif de quotas 045 est strictement typé sans any', () => {
  const qs = source('src/lib/billing/quotas-server.ts');
  assert.match(qs, /typeof d === 'object' && !Array\.isArray\(d\)/);
  assert.doesNotMatch(qs, /\(d:\s*any\)/);
});
