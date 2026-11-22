import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync('src/components/sidebar-membership.tsx','utf8');
test('079: plan card is not reloaded on each pathname navigation', () => {
  assert.doesNotMatch(source, /usePathname/);
  assert.match(source, /\}, \[userKey\]\);/);
  assert.match(source, /const cachedPlans = new Map/);
  assert.match(source, /PLAN_CACHE_MS/);
});
test('079: transient revalidation does not erase a known plan', () => {
  assert.match(source, /loading && tier === 'unknown'/);
  assert.match(source, /if \(nextTier !== 'unknown'\)/);
  assert.match(source, /cachedPlans\.set\(userKey/);
});
test('079: explicit billing updates invalidate and revalidate', () => {
  assert.match(source, /nashra:billing-updated/);
  assert.match(source, /invalidateLimits\(\)/);
  assert.match(source, /updatePlan\(true\)/);
});
