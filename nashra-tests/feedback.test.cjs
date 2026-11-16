const test = require('node:test');
const assert = require('node:assert/strict');
const {queueNotices,campaignFailure,readable} = require('../src/lib/feedback.ts');
test('Chaque résultat Telegram garde son propre niveau dans une campagne mixte',()=>{
  const rows = ['telegram_scheduled','sent','approved','needs_review','blocked'].map(status=>({status}));
  const notices = queueNotices(rows);
  assert.deepEqual(notices.map(x=>x.tone),['error','warning','success','success','info']);
  assert.match(notices[2].text,/programmé/);
  assert.match(notices[3].text,/confirmé/);
});
test('Une réponse HTML après soumission laisse le résultat incertain',async()=>{
  const error = await new Response('<html>').json().catch(e=>e);
  const notice = campaignFailure(error);
  assert.equal(notice.tone,'warning');
  assert.match(notice.text,/avant toute nouvelle tentative/);
  assert.equal(readable(error,'Planning indisponible'),'Planning indisponible');
});
test('Un refus explicite reste rouge et un envoi non confirmé reste ambre',()=>{
  assert.equal(campaignFailure('Compte non autorisé à publier.').tone,'error');
  assert.equal(campaignFailure('Envoi non confirmé').tone,'warning');
  assert.equal(campaignFailure(new TypeError('Failed to fetch')).tone,'warning');
});
