import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Le layout effectue une seule vérification distante authentifiée', () => {
  const content = source('src/app/(dashboard)/layout.tsx');
  assert.match(content, /auth\.getUser\(\)/);
  assert.doesNotMatch(content, /auth\.getClaims\(\)/);
});

test('La traduction ne reparcourt pas toute la page à chaque mutation', () => {
  const content = source('src/lib/i18n/provider.tsx');
  assert.match(content, /record\.addedNodes\.forEach\(node => dirty\.add\(node\)\)/);
  assert.match(content, /requestAnimationFrame/);
  assert.match(content, /dirty\.add\(document\.body\)/);
  assert.match(content, /const roots = nodes\.filter/);
});

test('Les compteurs partagent une requête utilisateur et un cache éphémère', () => {
  const client = source('src/lib/billing/client-snapshot.ts');
  const sidebar = source('src/components/sidebar-membership.tsx');
  const quota = source('src/components/quota-alert.tsx');
  assert.match(client, /inflight\?\.userKey === userKey/);
  assert.match(client, /cache: 'no-store'/);
  assert.match(client, /const requestedVersion = version/);
  assert.match(sidebar, /loadLimits\(userKey\)/);
  assert.match(quota, /loadLimits\(userKey\)/);
});

test('Supabase ne renvoie plus la totalité du workspace pour les quotas', () => {
  const content = source('src/lib/billing/quotas-server.ts');
  assert.match(content, /select\('destinations:data->destinations'\)/);
  assert.match(content, /groups\.data\?\.destinations/);
});

test('Le tutoriel n’est pas importé dans le menu à chaque visite', () => {
  const gate = source('src/components/dashboard-tour-gate.tsx');
  const account = source('src/components/account-menu.tsx');
  assert.match(gate, /dynamic\(\(\) => import\('\.\/dashboard-tour'\)/);
  assert.match(account, /from '@\/components\/tour-labels'/);
  assert.doesNotMatch(account, /from '@\/components\/dashboard-tour'/);
});

test('Les cartes d’annonces sont rendues par lots et la recherche est différée', () => {
  const content = source('src/app/(dashboard)/annonces/page.tsx');
  assert.match(content, /useDeferredValue\(query\)/);
  assert.match(content, /useState\(24\)/);
  assert.match(content, /visibleAnnouncements\.map/);
  assert.match(content, /setVisibleCount\(current => current \+ 24\)/);
});

test('Les métadonnées des prix Stripe sont mises en cache seulement après vérification', () => {
  const content = source('src/app/api/billing/status/route.ts');
  assert.match(content, /validStripePrice\(remote, interval, expectedCents\)/);
  assert.match(content, /PRICE_CACHE_TTL/);
  assert.match(content, /pendingPrices\.get\(key\)/);
});
