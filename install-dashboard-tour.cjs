/* Nashra : dashboard guided tour — minimal, reversible installer */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = process.cwd();
const payload = path.join(root, 'nashra-tour-payload');
const relative = {
  shell: 'src/components/shell.tsx',
  account: 'src/components/account-menu.tsx',
  css: 'src/app/globals.css',
  tour: 'src/components/dashboard-tour.tsx',
};
function load(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function ensure(test, message) { if (!test) throw new Error(message); }
ensure(fs.existsSync(path.join(root, 'package.json')), 'Ouvrez le dossier du projet Nashra.');
ensure(JSON.parse(load('package.json')).name === 'nashra', 'Projet Nashra introuvable.');
ensure(fs.existsSync(payload), 'Archive incomplète : dossier nashra-tour-payload absent.');
for (const [name, file] of Object.entries(relative)) {
  if (name !== 'tour') ensure(fs.existsSync(path.join(root, file)), `Fichier attendu introuvable : ${file}`);
}
const expected = fs.readFileSync(path.join(payload, 'src/components/dashboard-tour.tsx'), 'utf8');
const styles = fs.readFileSync(path.join(payload, 'tour-styles.css'), 'utf8');
let shell = load(relative.shell);
let account = load(relative.account);
let css = load(relative.css);
const oldTour = fs.existsSync(path.join(root, relative.tour)) ? load(relative.tour) : null;
ensure(oldTour === null || oldTour === expected, 'Un autre tutoriel est déjà présent : aucun fichier modifié.');
const clientMarker = /(['"])use client\1;?/;
ensure(clientMarker.test(shell) && clientMarker.test(account), 'Composants clients inattendus, arrêt sans modification.');
if (!shell.includes("from '@/components/dashboard-tour'")) {
  shell = shell.replace(clientMarker, x => x + "\nimport { DashboardTour } from '@/components/dashboard-tour';");
}
if (!shell.includes('<DashboardTour userEmail={userEmail} ready={ready} />')) {
  ensure(shell.includes('{toast && <div role="status"'), 'Point de montage du tutoriel introuvable dans Shell.');
  shell = shell.replace('{toast && <div role="status"', '<DashboardTour userEmail={userEmail} ready={ready} />\n    {toast && <div role="status"');
}
if (!account.includes("from '@/components/dashboard-tour'")) {
  account = account.replace(clientMarker, x => x + "\nimport { TOUR_REPLAY_LABELS } from '@/components/dashboard-tour';");
}
if (!account.includes("from '@/lib/i18n/provider'")) {
  account = account.replace(clientMarker, x => x + "\nimport { useLanguage } from '@/lib/i18n/provider';");
}
if (!account.includes('HelpCircle as NashraTourHelp')) {
  account = account.replace(clientMarker, x => x + "\nimport { HelpCircle as NashraTourHelp } from 'lucide-react';");
}
if (!account.includes('const { locale } = useLanguage();')) {
  ensure(account.includes('const [open, setOpen] = useState(false);'), 'Point d’ancrage du menu Profil introuvable.');
  account = account.replace('const [open, setOpen] = useState(false);',
    'const { locale } = useLanguage();\n  const [open, setOpen] = useState(false);');
}
if (!account.includes('data-nashra-tour-replay')) {
  const marker = '<OnboardingAccountLink onNavigate={close} />';
  const alternate = '<Link href="/parametres"';
  ensure(account.includes(marker) || account.includes(alternate), 'Point d’ancrage pour rejouer le tutoriel introuvable.');
  const button = `<button type="button" role="menuitem" data-nashra-tour-replay onClick={() => {
              close();
              window.dispatchEvent(new Event('nashra:dashboard-tour:replay'));
            }}>
              <NashraTourHelp size={17} />
              <span>{TOUR_REPLAY_LABELS[locale]}</span>
            </button>\n            `;
  if (account.includes(marker)) account = account.replace(marker, button + marker);
  else account = account.replace(alternate, button + alternate);
}
if (!css.includes('/* Nashra — visite guidée du tableau de bord')) css += '\n' + styles + '\n';
const outputs = [
  [relative.shell, shell],
  [relative.account, account],
  [relative.css, css],
  [relative.tour, expected],
];
const changed = outputs.filter(([file, value]) => !fs.existsSync(path.join(root, file)) || load(file) !== value);
if (!changed.length) { console.log('Tutoriel Nashra déjà installé — aucun changement.'); process.exit(0); }
const backup = path.join(root, 'nashra-backups', 'dashboard-tour-' + new Date().toISOString().replace(/[:.]/g, '-'));
const written = [];
try {
  for (const [file, value] of changed) {
    const destination = path.join(root, file);
    if (fs.existsSync(destination)) {
      const saved = path.join(backup, file);
      fs.mkdirSync(path.dirname(saved), { recursive: true });
      fs.copyFileSync(destination, saved);
    }
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const temporary = destination + '.ntour-temp';
    fs.writeFileSync(temporary, value, 'utf8');
    fs.renameSync(temporary, destination);
    written.push(file);
    console.log('OK', file);
  }
} catch (error) {
  for (const file of written.reverse()) {
    const previous = path.join(backup, file);
    const dest = path.join(root, file);
    if (fs.existsSync(previous)) fs.copyFileSync(previous, dest);
    else fs.rmSync(dest, { force: true });
  }
  throw error;
}
console.log('Sauvegardes :', backup);
console.log('Aucun SQL, aucune nouvelle page, aucun changement aux publications Telegram.');
console.log('Test : npm run typecheck puis ouvrez http://localhost:3000/');
