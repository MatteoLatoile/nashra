import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = name => readFileSync(new URL(`../${name}`,import.meta.url),'utf8');

test('Le contrôle automatique lit la file Telegram et ne publie jamais',()=>{
  const api=src('src/app/api/automation/verify/route.ts');
  assert.match(api,/GetScheduledHistory/);
  assert.match(api,/withSchedulingClient/);
  assert.match(api,/listDialogsRaw\(client\)/);
  assert.doesNotMatch(api,/client\.sendMessage|sendFile\(|scheduleOnConnectedTelegram\(/);
  assert.match(api,/peerOf\(campaign,job\.destination_id\)/);
  assert.match(api,/destinationHandles/);
});
test('Les absences dans Telegram ne sont jamais classées comme des envois confirmés',()=>{
  const api=src('src/app/api/automation/verify/route.ts');
  assert.match(api,/ceci ne prouve ni un envoi ni une annulation/);
  assert.match(api,/found===ids\.length/);
  assert.match(api,/status:'missing'/);
});
test('Les décisions manuelles sont authentifiées, explicites et réservées aux envois passés',()=>{
  const api=src('src/app/api/automation/verify/route.ts');
  assert.match(api,/context\(req,true\)/);
  assert.match(api,/confirmed!==true/);
  assert.match(api,/30\*60_000/);
  assert.match(api,/\.eq\('user_id',c\.userId\)\.eq\('campaign_id',campaign\.id\)/);
  assert.match(api,/\.eq\('status',job\.status\)/);
  assert.match(api,/status=sent\?'sent':'cancelled'/);
});
test('Les cartes indiquent groupe, heure, identifiant Telegram et actions explicites',()=>{
  const ui=src('src/components/schedule-verification.tsx');
  const page=src('src/app/(dashboard)/campagnes/page.tsx');
  const queue=src('src/app/api/automation/queue/route.ts');
  assert.match(ui,/Telegram : \$\{ids\.join/);
  assert.match(ui,/Marquer comme envoyé/);
  assert.match(ui,/Marquer comme non envoyé/);
  assert.match(ui,/Vérifier maintenant/);
  assert.match(ui,/expanded && <div className="n52-verification-detail"/);
  assert.match(ui,/claimAutomaticCheck\(campaignId, Date\.now\(\)\)/);
  assert.match(page,/ScheduleVerification/);
  assert.match(queue,/telegram_scheduled_ids/);
});
test('Vérifier une programmation incertaine ne la renvoie pas et ne valide pas une absence',()=>{
  const api=src('src/app/api/automation/verify/route.ts');
  const ui=src('src/components/schedule-verification.tsx');
  assert.match(api,/job\.status==='needs_review'/);
  assert.match(api,/status:'telegram_scheduled'/);
  assert.match(api,/gt\('scheduled_at'/);
  assert.match(api,/Aucun message renvoyé/i);
});
test('Les confirmations manuelles ne sont pas présentées comme preuves de livraison Telegram',()=>{
  const schedule=src('src/lib/automation/schedule-display.ts');
  const feedback=src('src/lib/feedback.ts');
  assert.match(schedule,/Déclaré envoyé/);
  assert.match(schedule,/Déclaré non envoyé/);
  assert.match(feedback,/non certifié\(s\) par Telegram/);
  assert.match(feedback,/job\.last_error\?\.startsWith\('Déclaré envoyé manuellement'\)/);
});
