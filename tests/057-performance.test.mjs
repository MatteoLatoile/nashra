import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, statSync } from 'node:fs';
const index = readFileSync('src/lib/i18n/index.ts', 'utf8');
const provider = readFileSync('src/lib/i18n/provider.tsx', 'utf8');
test('catalogue de traduction absent du chargement statique initial', () => {
  assert.doesNotMatch(index, /import\s+catalog\s+from\s+['"]\.\/catalog\.json/);
  assert.match(index, /import\(['"]\.\/catalog\.json['"]\)/);
});
test('chargement dedoublonne du catalogue', () => {
  assert.match(index, /if \(!loadingCatalog\)/);
  assert.match(index, /if \(translations\) return Promise\.resolve\(\)/);
});
test('francais garde son texte natif sans observer permanent', () => {
  assert.match(provider, /locale === 'fr' && !hasUsedBridge\.current/);
  assert.match(provider, /if \(locale === 'fr'\) \{[\s\S]*?observer\.disconnect\(\)/);
});
test('changement de langue recharge la traduction sans supprimer de langues', () => {
  assert.match(provider, /loadTranslationCatalog\(\)/);
  assert.match(provider, /setCatalogVersion\(v => v \+ 1\)/);
  assert.match(provider, /\[locale, choice, device, saving, saveError, chooseLanguage, catalogVersion\]/);
  assert.ok(statSync('src/lib/i18n/catalog.json').size > 100_000);
});
