const fs=require('node:fs'),path=require('node:path');
const base=process.cwd();const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'manifest.json'),'utf8'));
const cat=JSON.parse(fs.readFileSync(path.join(base,'src/lib/i18n/catalog.json'),'utf8'));
const additions=JSON.parse(fs.readFileSync(path.join(__dirname,'patch-files','i18n-extras.json'),'utf8'));
let missing=[];
for(const key of Object.keys(additions))for(const lang of manifest.languages)if(!cat[key]?.[lang])missing.push(`${key} [${lang}]`);
const all=Object.values(cat).filter(value=>manifest.languages.every(lang=>typeof value[lang]==='string'&&value[lang])).length;
const present=Object.keys(manifest.expected_sha256).filter(rel=>fs.existsSync(path.join(base,rel))).length;
const css=fs.readFileSync(path.join(base,'src/app/globals.css'),'utf8');
console.log(`Nashra i18n: ${all}/${Object.keys(cat).length} entrées complètes, ${manifest.languages.length+1} langues (français inclus).`);
console.log('Écrans concernés présents :',present,'/',Object.keys(manifest.expected_sha256).length);
console.log('RTL V3 :',css.includes('/* Nashra i18n V3 — RTL:')?'OK':'absent');
console.log('Traductions additionnelles manquantes :',missing.length);
if(missing.length){console.error(missing.slice(0,12).join('\n'));process.exitCode=1;}
