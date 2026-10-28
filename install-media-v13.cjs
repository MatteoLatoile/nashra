// Nashra V1.3: adds direct image upload to the existing V1.2 ad library.
// Re-run safe; UTF-8 throughout; original files backed up before edits.
const fs = require('node:fs');
const path = require('node:path');
const root = process.cwd();
const source = __dirname;
const adPage = path.join(root, 'src/app/(dashboard)/annonces/page.tsx');
const cssPath = path.join(root, 'src/app/globals.css');
const componentPath = path.join(root, 'src/components/announcement-image-upload.tsx');
const componentSource = path.join(source, 'src/components/announcement-image-upload.tsx');
const stylesSource = path.join(source, 'upload-v13.css');
const sql = path.join(source, 'supabase/003_announcement_images.sql');

for (const p of [adPage, cssPath, componentSource, stylesSource, sql]) {
  if (!fs.existsSync(p)) throw Error(`Fichier requis introuvable : ${p}`);
}
let page = fs.readFileSync(adPage, 'utf8');
let css = fs.readFileSync(cssPath, 'utf8');
const importLine = "import { AnnouncementImageUpload } from '@/components/announcement-image-upload';";
const marker = '/* NASHRA V1.3 — uploads d\'images Supabase Storage */';
const oldHint = 'Les images sont affichées depuis leurs liens ; aucun fichier n’est envoyé vers Supabase Storage. Pour importer un message Telegram existant, utilisez la page Telegram.';
const newHint = 'Les images ajoutées depuis votre ordinateur sont hébergées dans un bucket public Supabase Storage. Leur URL est accessible à toute personne qui la possède. Les transferts Telegram nécessitent toujours les autorisations du groupe.';

if (!page.includes('form-stack n12-editor') || !page.includes('linksFromEditor(editor.pictures)')) {
  throw Error('La bibliothèque V1.2 n’est pas détectée. Installez V1.2 avant ce correctif. Aucun fichier modifié.');
}
if (!page.includes(importLine)) {
  if (!page.includes("import Link from 'next/link';")) throw Error('Import Link inattendu. Aucun fichier modifié.');
  page = page.replace("import Link from 'next/link';", "import Link from 'next/link';\n" + importLine);
}
if (!page.includes('<AnnouncementImageUpload')) {
  const anchor = '        <div className="n12-image-thumbs">';
  if (!page.includes(anchor)) throw Error('Galerie V1.2 introuvable. Aucun fichier modifié.');
  const upload = `        <AnnouncementImageUpload
          currentCount={linksFromEditor(editor.pictures).length}
          maxCount={maxImages}
          onUploaded={urls => setEditor(previous => previous ? {
            ...previous,
            pictures: [...new Set([...linksFromEditor(previous.pictures), ...urls])].join('\\n')
          } : previous)}
        />
`;
  page = page.replace(anchor, upload + anchor);
}
// Display newly uploaded images and allow removal from the editor before save.
const oldThumbnails = '        <div className="n12-image-thumbs">{linksFromEditor(editor.pictures).filter(isHttpsImageUrl).slice(0, maxImages).map(url => <img key={url} src={url} alt="Prévisualisation du média" loading="lazy"/>)}</div>';
const newThumbnails = `        <div className="n12-image-thumbs">{linksFromEditor(editor.pictures).filter(isHttpsImageUrl).slice(0, maxImages).map(url =>
          <span className="n13-thumb" key={url}>
            <img src={url} alt="Prévisualisation du média" loading="lazy" />
            <button type="button" aria-label="Retirer cette photo de l’annonce" title="Retirer du brouillon"
              onClick={() => setEditor(previous => previous ? { ...previous,
                pictures: linksFromEditor(previous.pictures).filter(item => item !== url).join('\\n')
              } : previous)}><X size={12}/></button>
          </span>
        )}</div>`;
if (!page.includes('className="n13-thumb"')) {
  if (!page.includes(oldThumbnails)) throw Error('Galerie V1.2 différente de celle attendue. Aucun fichier modifié.');
  page = page.replace(oldThumbnails, newThumbnails);
}
if (page.includes(oldHint)) page = page.replace(oldHint, newHint);
const styles = fs.readFileSync(stylesSource, 'utf8');
if (!css.includes(marker)) css = css.trimEnd() + '\n\n' + styles + '\n';

const backup = path.join(root, 'nashra-backups', `media-v1.3-${new Date().toISOString().replace(/[:.]/g, '-')}`);
const files = [adPage, cssPath, componentPath];
for (const file of files) {
  if (!fs.existsSync(file)) continue;
  const saved = path.join(backup, path.relative(root, file));
  fs.mkdirSync(path.dirname(saved), {recursive:true});
  fs.copyFileSync(file, saved);
}
fs.mkdirSync(path.dirname(componentPath), {recursive:true});
fs.writeFileSync(adPage, page, 'utf8');
fs.writeFileSync(cssPath, css, 'utf8');
fs.copyFileSync(componentSource, componentPath);
console.log('Nashra V1.3 installé : ajout de photos, galerie, contrôles de fichier.');
console.log('Sauvegardes des fichiers précédents :', backup);
console.log('ÉTAPE OBLIGATOIRE : exécutez supabase/003_announcement_images.sql dans le SQL Editor Supabase.');
console.log('Puis : npm run typecheck && npm run dev -- --port 3000');
