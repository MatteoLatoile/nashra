import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../src/app/page.tsx', import.meta.url), 'utf8');
const dash = readFileSync(new URL('../src/app/(dashboard)/dashboard/page.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/app/(dashboard)/dashboard/dashboard.module.css', import.meta.url), 'utf8');

test('073: plan comparison states same group cap and different volumes', () => {
  assert.match(page, /Pro et Business : mêmes 30 groupes actifs/);
  assert.match(page, /Business.*2 000 envois et 300 programmations/);
  assert.match(page, /Pro comprend 1 000 envois et 150 programmations/);
});
test('073: paid plan CTA uses existing authenticated checkout route', () => {
  assert.match(page, /`Choisir \$\{plan\.name\}`/);
  assert.match(page, /\/connexion\?next=\$\{encodeURIComponent\(`/);
  assert.match(page, /checkout=\$\{plan\.id\}&interval=\$\{cycle\}/);
});
test('073: landing gives a clear how-to route without fake claims', () => {
  assert.match(page, /Voir comment démarrer en 4 étapes/);
  assert.match(page, /href="#fonctionnement"/);
});
test('073: onboarding uses workspace status and one relevant action', () => {
  assert.match(dash, /!allReady && <section className=\{styles\.startBanner\}/);
  assert.match(dash, /readySteps\.find\(step => !step\.isReady\)/);
  assert.match(dash, /Aucune publication ne sera envoyée sans votre action/);
  assert.match(css, /\.startBanner\{/);
});
test('073: no publication or billing endpoint changed for conversion', () => {
  assert.doesNotMatch(dash, /publishNow\(|stripe\.checkout\.sessions\.create/);
});
