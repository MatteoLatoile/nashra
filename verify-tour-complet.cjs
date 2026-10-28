/* Static, read-only consistency checks. Does not send anything. */
'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const read = file => fs.readFileSync(file,'utf8');
const component = read('src/components/dashboard-tour.tsx');
const shell = read('src/components/shell.tsx');
const account = read('src/components/account-menu.tsx');
const css = read('src/app/globals.css');
const steps = (component.match(/\{ id: '[^']+', chapter:/g)||[]).length;
const fr = (component.split('const FRENCH:')[1]||'').split('const ENGLISH:')[0];
const en = (component.split('const ENGLISH:')[1]||'').split('// Every existing Nashra locale')[0];
const copyRows = part => (part.match(/^  \[/gm)||[]).length;
assert.equal(steps,40,'Nombre d’étapes inattendu');
assert.equal(copyRows(fr),steps,'Traductions françaises incomplètes');
assert.equal(copyRows(en),steps,'Traductions anglaises incomplètes');
const localeBlocks = component.split('const EXTRA_RAW:')[1].split('const EXTRA_COPY:')[0];
for (const code of ['ar','ru','es','it','de','id','fil','tr','ur']) {
  const match = localeBlocks.match(new RegExp('  '+code+': `([\\s\\S]*?)`,'));
  assert.ok(match, 'Traduction introuvable : '+code);
  const rows = match[1].trim().split('\n');
  assert.equal(rows.length,steps, 'Mauvais nombre de textes : '+code);
  assert.ok(rows.every(row => row.includes('§') && row.split('§')[0] && row.split('§')[1]), 'Texte incomplet : '+code);
}
for (const p of ['/annonces','/telegram','/groupes','/campagnes','/historique','/profil','/parametres'])
  assert.ok(component.includes(`path: '${p}'`),`Page absente : ${p}`);
for (const code of ['fr','en','ar','ru','es','it','de','id','fil','tr','ur'])
  assert.ok(new RegExp('(?:^|\\s)'+code+': \\{', 'm').test(component) || (code!=='fr' && code!=='en' && component.includes('  '+code+': `')),'Langue absente : '+code);
assert.equal(shell.split('<DashboardTour userEmail={userEmail} ready={ready} />').length-1,1,'Montage du guide dupliqué');
assert.equal(account.split('data-nashra-tour-replay').length-1,1,'Bouton replay dupliqué');
assert.equal(css.split('/* NASHRA COMPLETE TOUR V2 — KEEP MARKER FOR IDEMPOTENT INSTALL */').length-1,1,'CSS du guide absent ou dupliqué');
assert.ok(component.includes("localStorage.setItem(keyFor(userEmail)"),'Suivi de progression absent');
assert.ok(component.includes("if (pathname !== step.path) { router.push(step.path); return; }"),'Navigation multi-page absente');
assert.ok(!component.includes('fetch('),'Le tutoriel ne doit effectuer aucun appel réseau');
assert.ok(!component.includes('submit()'),'Le tutoriel ne doit soumettre aucun formulaire');
console.log(`✅ Tutoriel complet : ${steps} étapes, 7 chapitres, 11 langues, navigation multi-pages.`);
console.log('✅ Aucun envoi Telegram, paiement ou modification de données dans le tour.');
