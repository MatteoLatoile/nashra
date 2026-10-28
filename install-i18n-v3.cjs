/** Nashra v3 internationalisation upgrade. No network access or secrets required. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const base = process.cwd();
const bundle = __dirname;
const manifest = JSON.parse(fs.readFileSync(path.join(bundle,'manifest.json'),'utf8'));
const extras = JSON.parse(fs.readFileSync(path.join(bundle,'patch-files','i18n-extras.json'),'utf8'));
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const catalogRel = 'src/lib/i18n/catalog.json';
const cssRel = 'src/app/globals.css';
const backup = path.join(base, 'nashra-backups', 'i18n-v3-' + new Date().toISOString().replace(/[:.]/g,'-'));
const catalogPath = path.join(base,catalogRel);
const providerPath = path.join(base,'src/lib/i18n/provider.tsx');
if (!fs.existsSync(catalogPath) || !fs.existsSync(providerPath)) {
  throw Error('Le module internationalisation Nashra est absent : installez d’abord les 11 langues existantes. Aucun fichier modifié.');
}
if (!fs.existsSync(path.join(base,cssRel))) throw Error('src/app/globals.css introuvable. Aucun fichier modifié.');
const catalog = JSON.parse(fs.readFileSync(catalogPath,'utf8'));
if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) throw Error('Catalogue i18n inattendu. Aucun fichier modifié.');
const ready = []; const conflicts = []; const absent = []; let installed = 0;
for(const [rel,expectedHash] of Object.entries(manifest.expected_sha256)) {
  const source = path.join(bundle,'patch-files',rel), destination = path.join(base,rel);
  if (!fs.existsSync(destination)) {absent.push(rel); continue;}
  const destinationHash = sha(fs.readFileSync(destination));
  const targetHash = sha(fs.readFileSync(source));
  if (destinationHash === targetHash) continue; // already updated
  if (destinationHash === expectedHash) ready.push([rel,source,destination]);
  else conflicts.push(rel); // preserves user modifications
}
function saveOriginal(rel) {
  const from = path.join(base,rel); const dest = path.join(backup,rel);
  fs.mkdirSync(path.dirname(dest), {recursive:true});
  fs.copyFileSync(from,dest);
}
// Prepare changes to translations before touching files.
const languages = manifest.languages;
for (const [key,values] of Object.entries(extras)) {
  if (languages.some(locale => typeof values[locale] !== 'string' || !values[locale]))
    throw Error('Traduction incomplète : '+key+'. Aucun fichier modifié.');
}
const additions = Object.entries(extras).filter(([key]) => !catalog[key]);
const cssPath = path.join(base,cssRel);
const marker = '/* Nashra i18n V3 — RTL:';
const cssAppend = fs.readFileSync(cssPath,'utf8').includes(marker) ? '' : fs.readFileSync(path.join(bundle,'patch-files','rtl.css'),'utf8');
if (ready.length || additions.length || cssAppend) {
  fs.mkdirSync(backup,{recursive:true});
  if (additions.length) {
    saveOriginal(catalogRel);
    for (const [key,translations] of additions) catalog[key] = translations;
    fs.writeFileSync(catalogPath,JSON.stringify(catalog,null,2)+'\n','utf8');
  }
  if (cssAppend) {saveOriginal(cssRel);fs.appendFileSync(cssPath,cssAppend,'utf8');}
  for (const [rel,source,destination] of ready) {saveOriginal(rel);fs.copyFileSync(source,destination);installed++;}
}
console.log('\nNASHRA — 11 LANGUES / MISE À JOUR V3');
console.log('Nouvelles entrées traduites :',additions.length,'| Catalogue total :',Object.keys(catalog).length);
console.log('Composants actualisés :',installed,'/ '+Object.keys(manifest.expected_sha256).length);
console.log('Mise en page RTL :',cssAppend ? 'ajoutée':'déjà présente');
if (ready.length || additions.length || cssAppend) console.log('Sauvegardes :',backup);
if (absent.length) console.log('Pages absentes ignorées :\n  - '+absent.join('\n  - '));
if (conflicts.length) {
  console.log('\nATTENTION : fichiers personnalisés conservés, non remplacés :\n  - '+conflicts.join('\n  - '));
  console.log('Les traductions du catalogue seront disponibles même dans ces pages via la couche existante.');
}
console.log('\nVérifier : node .\\verify-i18n-v3.cjs');
console.log('Puis : npm run typecheck');
