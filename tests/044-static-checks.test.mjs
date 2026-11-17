// Contrôles statiques du correctif 044. Ces tests NE remplacent PAS les tests
// d'intégration Stripe/Telegram/Supabase en production.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('La migration de correctif fixe exactement les quotas Free/Pro/Business', () => {
  const sql = read('supabase/025_plan_limits_044.sql');
  assert.match(sql, /\('free',\s*1,\s*3,\s*30,\s*5\)/);
  assert.match(sql, /\('pro',\s*1,\s*30,\s*1000,\s*150\)/);
  assert.match(sql, /\('business',\s*1,\s*30,\s*2000,\s*300\)/);
  assert.match(sql, /BEGIN\s*;/);
  assert.match(sql, /COMMIT\s*;/);
  assert.match(sql, /IS DISTINCT FROM/);
  assert.doesNotMatch(sql, /^\s*(?:DELETE\s+FROM|DROP\s+TABLE|TRUNCATE)\s+/im);
});

test('Le diagnostic vérifie la configuration Stripe selon son mode réel', () => {
  const route = read('src/app/api/diagnostics/route.ts');
  assert.match(route, /const stripeMode = billingMode\(\)/);
  assert.match(route, /stripeMode === 'live'/);
  assert.match(route, /configuredPrice\(tier, interval\)/);
  assert.doesNotMatch(route, /configuration\.stripeTest/);
  assert.match(route, /Le diagnostic ne contacte pas Stripe/);
});

test('Le kill switch global n’est pas affiché comme une publication active', () => {
  const route = read('src/app/api/diagnostics/route.ts');
  assert.match(route, /NASHRA_DISABLE_ALL_SENDS !== '1'/);
  assert.match(route, /Envois suspendus par l’interrupteur de sécurité global/);
});

test('Le diagnostic compare les plafonds réellement enregistrés en base', () => {
  const route = read('src/app/api/diagnostics/route.ts');
  assert.match(route, /db\.from\('nashra_plans'\)/);
  assert.match(route, /business: \[1, 30, 2000, 300\]/);
  assert.match(route, /free: \[1, 2, 10, 3\]/);
  assert.match(route, /appliquer SQL 029/);
});

test('Les pages ne déclarent plus que toute l’automatisation est inexistante', () => {
  for (const file of [
    'src/app/(dashboard)/parametres/page.tsx',
    'src/app/(dashboard)/automatisation/page.tsx',
    'src/app/(dashboard)/planification/page.tsx',
  ]) {
    const text = read(file);
    assert.doesNotMatch(text, /aucune publication automatisée|Aucun envoi automatique dans cette version|planification à venir/i, file);
  }
  const settings = read('src/app/(dashboard)/parametres/page.tsx');
  assert.match(settings, /fetch\('\/api\/diagnostics'/);
  assert.match(settings, /Configurées · à vérifier/);
});
