// Nashra V1.2 Library installer: no external dependencies, idempotent.
const fs = require('fs');
const path = require('path');
const root = process.cwd();
const store = path.join(root, 'src/lib/store.tsx');
const page = path.join(root, 'src/app/(dashboard)/annonces/page.tsx');
const css = path.join(root, 'src/app/globals.css');
const sourcePage = path.join(__dirname, 'src/app/(dashboard)/annonces/page.tsx');
const sourceCSS = path.join(__dirname, 'announcements-v12.css');
const marker = '/* NASHRA LIBRARY V1.2';

for (const filename of [store, page, css, sourcePage, sourceCSS]) {
  if (!fs.existsSync(filename)) throw Error(`Fichier manquant : ${filename}`);
}
const backup = path.join(root, 'nashra-backups', `library-v1.2-${new Date().toISOString().replace(/[:.]/g, '-')}`);
function saveOld(file) {
  const destination = path.join(backup, path.relative(root, file));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(file, destination);
}

let code = fs.readFileSync(store, 'utf8');
const hasUpdateFunction = code.includes('function updateAnnouncement(id: string, fields:');
if (!code.includes('imageUrls?: string[]')) {
  const find = 'sourceMessageId?: number; createdAt: string';
  if (!code.includes(find)) throw Error('Type Announcement non reconnu dans store.tsx. Aucun fichier modifié.');
  code = code.replace(find, 'sourceMessageId?: number; imageUrls?: string[]; tags?: string[]; updatedAt?: string; createdAt: string');
}
if (!code.includes('updateAnnouncement: (id: string, fields:')) {
  const anchor = '  removeAnnouncement: (id: string) => void;';
  if (!code.includes(anchor)) throw Error('Type du store introuvable. Aucun fichier modifié.');
  code = code.replace(anchor, "  updateAnnouncement: (id: string, fields: Partial<Pick<Announcement, 'title' | 'category' | 'body' | 'sourceUrl' | 'imageUrls' | 'tags'>>) => void;\n" + anchor);
}
if (!hasUpdateFunction) {
  const anchor = '  function removeAnnouncement(id: string) {';
  if (!code.includes(anchor)) throw Error('Fonction de suppression introuvable. Aucun fichier modifié.');
  const addition = `  function updateAnnouncement(id: string, fields: Partial<Pick<Announcement, 'title' | 'category' | 'body' | 'sourceUrl' | 'imageUrls' | 'tags'>>) {
    update(s => ({ ...s,
      announcements: s.announcements.map(a => a.id === id ? { ...a, ...fields, updatedAt: now() } : a),
      activity: [log('Annonce modifiée', fields.title || s.announcements.find(a => a.id === id)?.title || 'Annonce'), ...s.activity],
    }));
    notify('Annonce mise à jour.');
  }
`;
  code = code.replace(anchor, addition + anchor);
}
const contextOld = 'addAnnouncement, importTelegramAnnouncements, recordPublication, removeAnnouncement,';
const contextNew = 'addAnnouncement, updateAnnouncement, importTelegramAnnouncements, recordPublication, removeAnnouncement,';
if (!code.includes(contextNew)) {
  if (!code.includes(contextOld)) throw Error('Contexte AppProvider inattendu. Aucun fichier modifié.');
  code = code.replace(contextOld, contextNew);
}
if (!code.includes('updateAnnouncement: (id: string, fields:') || !code.includes('imageUrls?: string[]') || !code.includes(contextNew)) {
  throw Error('Validation du store impossible. Aucun fichier modifié.');
}

saveOld(store); saveOld(page); saveOld(css);
fs.writeFileSync(store, code, 'utf8');
fs.copyFileSync(sourcePage, page);
let oldCSS = fs.readFileSync(css, 'utf8');
const newCSS = fs.readFileSync(sourceCSS, 'utf8');
if (oldCSS.includes(marker)) {
  oldCSS = oldCSS.slice(0, oldCSS.indexOf(marker)).trimEnd() + '\n\n' + newCSS;
} else oldCSS += '\n\n' + newCSS;
fs.writeFileSync(css, oldCSS, 'utf8');
console.log('✅ Bibliothèque Nashra V1.2 installée.');
console.log('✅ Édition, duplication, filtres, images HTTPS, aperçu album et cartes.');
console.log('✅ Campagnes, Supabase, Telegram et .env.local préservés.');
console.log('Sauvegardes :', backup);
console.log('Vérification suivante : npm run typecheck');
