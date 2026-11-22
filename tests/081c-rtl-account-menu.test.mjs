import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(p, 'utf8');
const css = read('src/app/globals.css');
const menu = read('src/components/account-menu.tsx');
const shell = read('src/components/shell.tsx');
const plans = read('src/components/sidebar-membership.tsx');
const settings = read('src/app/(dashboard)/parametres/page.tsx');
const catalog = JSON.parse(read('src/lib/i18n/catalog.json'));
const locales = ['en','ar','ru','es','it','de','id','fil','tr','ur'];

test('081C: left-side element is account popover (not duplicated sidebar)', () => {
  assert.match(menu, /<div className="na-menu" role="menu">/);
  assert.match(shell, /<AccountMenu\s+userEmail=/);
  assert.equal((shell.match(/<aside className=\{`sidebar/g) || []).length, 1);
});
test('081C: RTL popover is anchored at screen-safe left on desktop and mobile', () => {
  assert.match(css, /@media \(min-width: 651px\)\s*\{\s*html\[dir="rtl"\] \.topbar \.na-menu-root > \.na-menu\s*\{\s*left: 0;\s*right: auto;/);
  assert.match(css, /@media \(max-width: 650px\)[\s\S]*?html\[dir="rtl"\] \.topbar \.na-menu-root > \.na-menu\s*\{\s*left: 12px;\s*right: auto;/);
  assert.match(css, /html\[dir="rtl"\] \.topbar \.na-menu\s*\{\s*direction: rtl;/);
  assert.doesNotMatch(css, /html\[dir="rtl"\]\s+(?:body|html)\s*\{\s*overflow-x: hidden/);
});
test('081C: settings and plan are translated via catalog in every non-French language', () => {
  const labels = ['MON FORFAIT', 'Abonnement actif', 'CONFIGURATION', 'Gérez votre espace, votre compte Telegram et les options de publication.', 'Besoin d’aide pour la connexion, les programmations ou les abonnements ?', 'Consulter le centre d’aide →', 'Stockage et sauvegarde'];
  for (const label of labels) for (const l of locales) assert.ok(catalog[label]?.[l], `${label}/${l}`);
  assert.match(plans, /t\('MON FORFAIT'\)/);
  assert.match(plans, /t\(description\)/);
  assert.match(settings, /t\("CONFIGURATION"\)/);
  assert.match(settings, /t\("Gérez votre espace, votre compte Telegram et les options de publication\."\)/);
  assert.match(shell, /t\("Documentation Telegram"\)/);
});
