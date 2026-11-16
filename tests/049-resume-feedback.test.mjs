import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
const file = fs.readFileSync('src/app/(dashboard)/campagnes/page.tsx', 'utf8');
test('Les messages d erreur des actions sont affiches sur la carte concernee', () => {
  assert.match(file, /cardFeedback\?\.id === c\.id/);
  assert.match(file, /setCardFeedback\(\{ id: campaign\.id, kind: notice\.tone, text: notice\.text \}\)/);
  assert.match(file, /role=\{cardFeedback\.kind === 'error' \? 'alert' : 'status'\}/);
});
test('La synchro indisponible est signalee pres des boutons', () => {
  assert.match(file, /if \(campaign\) setCardFeedback\(\{ id: campaign\.id, kind: 'warning', text \}\)/);
});
test('Les actions donnent un retour des confirmation et du serveur', () => {
  assert.match(file, /Confirme ou annule cette action dans la fenêtre de confirmation/);
  assert.match(file, /Reprise acceptée par Nashra/);
});
test('Les envois futurs incertains sont explicitement signales lors de la reprise', () => {
  assert.match(file, /const futureUncertain = action === 'resume'/);
  assert.match(file, /Une reprise sans contrôle peut provoquer un doublon/);
});
