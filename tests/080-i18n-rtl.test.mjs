import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(path,'utf8');
const s=read('src/components/searchable-select.tsx');
const css=read('src/app/globals.css');
const catalog=JSON.parse(read('src/lib/i18n/catalog.json'));
test('080: reusable selectors use translated labels including dynamic messages', () => {
  assert.match(s, /useLanguage/);
  for (const phrase of ["Rechercher un groupe ou canal…", "Aucune destination trouvée.", "sélectionnée(s)", "Recherche par nom"]) assert.ok(s.includes(`t('${phrase}')`) || s.includes(`t("${phrase}")`));
});
test('080: all 11 supported languages have reusable select translations', () => {
  for (const phrase of ['Choisir une option','Aucun résultat','Rechercher','Effacer la recherche','Rechercher une destination'])
    for (const locale of ['en','ar','ru','es','it','de','id','fil','tr','ur']) assert.ok(catalog[phrase]?.[locale], `${phrase}/${locale}`);
});
test('080: RTL preserves LTR direction for phone/email/OTP, and corrects hero offsets', () => {
  assert.match(css, /input\[type="tel"\]/);
  assert.match(css, /input\[autocomplete="one-time-code"\]/);
  assert.match(css, /html\[dir="rtl"\] \.lp-floatcard/);
});
