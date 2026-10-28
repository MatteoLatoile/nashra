/* Nashra — Complete guided tour upgrade. No changes to Telegram or Supabase. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = process.cwd();
const payload = path.join(root, 'nashra-tour-complet-payload');
const files = {
  shell:'src/components/shell.tsx',
  account:'src/components/account-menu.tsx',
  css:'src/app/globals.css',
  tour:'src/components/dashboard-tour.tsx',
};
function requireThat(value, message) { if (!value) throw new Error(message); }
function read(relative) { return fs.readFileSync(path.join(root, relative), 'utf8'); }
requireThat(fs.existsSync(path.join(root, 'package.json')), 'Exécutez dans le dossier du projet Nashra.');
requireThat(JSON.parse(read('package.json')).name === 'nashra', 'package.json ne correspond pas à Nashra.');
for (const name of ['shell','account','css']) requireThat(fs.existsSync(path.join(root, files[name])), `Fichier introuvable : ${files[name]}`);
requireThat(fs.existsSync(path.join(payload, 'src/components/dashboard-tour.tsx')), 'Fichiers du correctif absents. Décompressez d’abord le ZIP.');
const tour = fs.readFileSync(path.join(payload, 'src/components/dashboard-tour.tsx'), 'utf8');
const extraStyles = fs.readFileSync(path.join(payload, 'tour-complete-styles.css'), 'utf8');
const clientMarker = /(['"])use client\1;?/;
let shell = read(files.shell);
let account = read(files.account);
let css = read(files.css);
requireThat(clientMarker.test(shell) && clientMarker.test(account), 'Structure client inattendue : aucune modification effectuée.');

// The previous seven-step tour already imports DashboardTour. Keep one mount.
if (!shell.includes("from '@/components/dashboard-tour'"))
  shell = shell.replace(clientMarker, match => match + "\nimport { DashboardTour } from '@/components/dashboard-tour';");
const mount = '<DashboardTour userEmail={userEmail} ready={ready} />';
if (!shell.includes(mount)) {
  requireThat(shell.includes('{toast && <div role="status"'), 'Emplacement de Shell introuvable. Aucun fichier modifié.');
  shell = shell.replace('{toast && <div role="status"', mount + '\n    {toast && <div role="status"');
}
requireThat(shell.split(mount).length === 2, 'Montage du guide présent plusieurs fois.');

if (!account.includes("from '@/components/dashboard-tour'"))
  account = account.replace(clientMarker, match => match + "\nimport { TOUR_REPLAY_LABELS } from '@/components/dashboard-tour';");
if (!account.includes("from '@/lib/i18n/provider'"))
  account = account.replace(clientMarker, match => match + "\nimport { useLanguage } from '@/lib/i18n/provider';");
if (!account.includes('HelpCircle as NashraTourHelp'))
  account = account.replace(clientMarker, match => match + "\nimport { HelpCircle as NashraTourHelp } from 'lucide-react';");
if (!account.includes('const { locale } = useLanguage();')) {
  requireThat(account.includes('const [open, setOpen] = useState(false);'), 'Menu du compte différent du projet attendu. Aucune modification effectuée.');
  account = account.replace('const [open, setOpen] = useState(false);', 'const { locale } = useLanguage();\n  const [open, setOpen] = useState(false);');
}
if (!account.includes('data-nashra-tour-replay')) {
  const anchor = account.includes('<OnboardingAccountLink onNavigate={close} />')
    ? '<OnboardingAccountLink onNavigate={close} />'
    : account.includes('<Link href="/parametres"') ? '<Link href="/parametres"' : null;
  requireThat(anchor, 'Insertion du bouton tutoriel impossible : menu Profil différent.');
  const button = `<button type="button" role="menuitem" data-nashra-tour-replay onClick={() => {
              close();
              window.dispatchEvent(new Event('nashra:dashboard-tour:replay'));
            }}>
              <NashraTourHelp size={17} />
              <span>{TOUR_REPLAY_LABELS[locale]}</span>
            </button>\n            `;
  account = account.replace(anchor, button + anchor);
}
requireThat(account.split('data-nashra-tour-replay').length === 2, 'Plusieurs boutons de tutoriel trouvés.');
const styleMarker = '/* NASHRA COMPLETE TOUR V2 — KEEP MARKER FOR IDEMPOTENT INSTALL */';
if (!css.includes(styleMarker)) css += '\n' + extraStyles + '\n';
const outputs = [[files.shell,shell],[files.account,account],[files.css,css],[files.tour,tour]];
const changed = outputs.filter(([file,value]) => !fs.existsSync(path.join(root,file)) || read(file) !== value);
if (changed.length === 0) { console.log('✅ Tutoriel complet déjà à jour : aucun changement.'); process.exit(0); }
const backupRoot = path.join(root, 'nashra-backups', 'tour-complet-' + new Date().toISOString().replace(/[:.]/g,'-'));
const written=[];
try {
  for (const [relative,content] of changed) {
    const dest=path.join(root,relative);
    if (fs.existsSync(dest)) {
      const saved=path.join(backupRoot,relative);
      fs.mkdirSync(path.dirname(saved),{recursive:true});
      fs.copyFileSync(dest,saved);
    }
    fs.mkdirSync(path.dirname(dest),{recursive:true});
    const temporary=dest+'.tour-tmp';
    fs.writeFileSync(temporary,content,'utf8');
    fs.renameSync(temporary,dest);
    written.push(relative);
    console.log('OK', relative);
  }
} catch(err) {
  for (const relative of written.reverse()) {
    const dest=path.join(root,relative), previous=path.join(backupRoot,relative);
    if (fs.existsSync(previous)) fs.copyFileSync(previous,dest);
    else fs.rmSync(dest,{force:true});
  }
  throw err;
}
console.log('✅ Tutoriel étendu installé. Sauvegardes :', backupRoot);
console.log('Aucun SQL, aucune variable .env, aucune modification de Telegram.');
console.log('Suivant : node .\\verify-tour-complet.cjs && npm run typecheck');
