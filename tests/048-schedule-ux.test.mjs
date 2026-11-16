import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const page = readFileSync('src/app/(dashboard)/campagnes/page.tsx', 'utf8');
const verification = readFileSync('src/components/schedule-verification.tsx', 'utf8');
const styles = readFileSync('src/app/globals.css', 'utf8');

test('One readable attention card replaces the duplicated large technical warning', () => {
  assert.match(page, /n52-compact-warning/);
  assert.match(page, /state\.attention &&/);
  assert.match(page, /<ScheduleVerification/);
  assert.match(page, /Pause à confirmer/);
  assert.doesNotMatch(page, /className="n46-action-needed"/);
  assert.match(page, /Nashra a suspendu les répétitions/);
});
test('Each action shows its own pending progress and disables conflicting actions', () => {
  assert.match(page, /runningAction/);
  assert.match(page, /Suppression en cours/);
  assert.match(page, /Mise en pause et annulation en cours/);
  assert.match(page, /disabled=\{busy\}/);
});
test('Verification is read-only and the original server route is unchanged', () => {
  assert.match(verification, /action: 'check'/);
  assert.match(verification, /fetch\('\/api\/automation\/verify'/);
  assert.doesNotMatch(verification, /\/api\/telegram\/user\/publish/);
});
test('Manual confirmation is never offered for a future message', () => {
  assert.match(verification, /Date\.now\(\) - Date\.parse\(job\.scheduled_at\) >= 30 \* 60_000/);
  assert.match(verification, /checked\?\.status !== 'scheduled'/);
  assert.match(verification, /checked\?\.status !== 'partial'/);
});
test('Feedback, spinners and accessible status messages are present', () => {
  assert.match(verification, /n48-spin/);
  assert.match(verification, /role="status"/);
  assert.match(page, /aria-live="polite"/);
  assert.match(styles, /\/\* Nashra 048/);
});
