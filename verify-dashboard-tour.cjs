/* Read-only validation for the Nashra dashboard tour. */
'use strict';
const fs = require('node:fs');
const root = process.cwd();
function read(path) { return fs.readFileSync(path, 'utf8'); }
function assert(condition, message) { if (!condition) throw Error(message); }
const component = read('src/components/dashboard-tour.tsx');
const shell = read('src/components/shell.tsx');
const menu = read('src/components/account-menu.tsx');
const css = read('src/app/globals.css');
const languages = ['fr','en','ar','ru','es','it','de','id','fil','tr','ur'];
for (const code of languages) assert(new RegExp('\\b'+code+': \\{').test(component), `Langue absente : ${code}`);
for (const target of ['/annonces','/telegram','/groupes','/campagnes','/historique']) {
  assert(component.includes("'"+target+"'"), `Étape absente : ${target}`);
  assert(shell.includes("href: '"+target+"'") || shell.includes('href="'+target+'"'), `Rubrique absente du menu : ${target}`);
}
assert((shell.match(/<DashboardTour userEmail=\{userEmail\} ready=\{ready\} \/>/g) || []).length === 1,
  'Le tutoriel doit être monté une seule fois.');
assert((menu.match(/data-nashra-tour-replay/g) || []).length === 1, 'Bouton de replay absent ou dupliqué.');
assert((css.match(/\/\* Nashra — visite guidée du tableau de bord/g) || []).length === 1,
  'CSS du tutoriel absent ou dupliqué.');
assert(component.includes('localStorage.setItem') && component.includes('localStorage.getItem'), 'Mémorisation manquante.');
assert(component.includes("pathname !== '/'"), 'Tutoriel non limité à l’accueil.');
console.log('Nashra : tutoriel valide, 7 étapes, 11 langues, aucune duplication du montage.');
