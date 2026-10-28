// Nashra public landing installer — preserves existing dashboard, auth, and tutorial.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = process.cwd();
const resolve = p => path.join(root, ...p.split('/'));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const pkg = require(resolve('package.json'));
if (pkg.name !== 'nashra') throw Error('Exécute ce script dans le dossier racine du projet Nashra.');

const dashboardOld = 'src/app/(dashboard)/page.tsx';
const dashboardNew = 'src/app/(dashboard)/dashboard/page.tsx';
const home = 'src/app/page.tsx';
const landingCss = 'src/app/landing.css';
const marker = 'lp-root';
if (fs.existsSync(resolve(home)) && fs.readFileSync(resolve(home), 'utf8').includes(marker) && fs.existsSync(resolve(dashboardNew))) {
  console.log('Nashra : la landing page est déjà installée. Aucune modification.');
  process.exit(0);
}
if (!fs.existsSync(resolve(dashboardOld))) {
  throw Error(`Page d'accueil actuelle introuvable : ${dashboardOld}. Installation annulée.`);
}
if (fs.existsSync(resolve(dashboardNew))) {
  throw Error(`Le chemin ${dashboardNew} existe déjà. Installation annulée pour ne rien écraser.`);
}
if (fs.existsSync(resolve(home)) || fs.existsSync(resolve(landingCss))) {
  throw Error('Une page publique ou son CSS existe déjà. Installation annulée pour éviter un écrasement.');
}
const edits = [
  ['src/components/shell.tsx', [
    ["{ label: 'Vue d’ensemble', href: '/', Icon: LayoutGrid }", "{ label: 'Vue d’ensemble', href: '/dashboard', Icon: LayoutGrid }"],
    ['<Link href="/" className="brand"', '<Link href="/dashboard" className="brand"'],
  ]],
  ['src/components/dashboard-tour.tsx', [
    ["path: '/'", "path: '/dashboard'", true],
    ["pathname !== '/'", "pathname !== '/dashboard'"],
    ["router.push('/')", "router.push('/dashboard')"],
  ]],
  ['src/app/connexion/page.tsx', [["redirect('/')", "redirect('/dashboard')"]]],
  ['src/app/connexion/auth-form.tsx', [["router.replace('/')", "router.replace('/dashboard')", true]]],
  ['src/app/bienvenue/onboarding-flow.tsx', [
    ["router.replace('/')", "router.replace('/dashboard')"],
    ["leave('/')", "leave('/dashboard')"],
  ]],
  ['src/app/reinitialiser/page.tsx', [['href="/"', 'href="/dashboard"']]],
  ['src/app/auth/callback/route.ts', [
    ["url.searchParams.get('next') || '/'", "url.searchParams.get('next') || '/dashboard'"],
    ["? next : '/'", "? (next === '/' ? '/dashboard' : next) : '/dashboard'"],
  ]],
];
// Complete all validations before making any change to avoid partially applied patches.
const updated = new Map();
for (const [filename, rules] of edits) {
  if (!fs.existsSync(resolve(filename))) throw Error(`Fichier manquant : ${filename}. Aucun changement effectué.`);
  let current = fs.readFileSync(resolve(filename), 'utf8');
  for (const [before, after, many] of rules) {
    if (!current.includes(before)) throw Error(`Structure inattendue dans ${filename}: ${before}. Aucun changement effectué.`);
    current = many ? current.split(before).join(after) : current.replace(before, after);
  }
  updated.set(filename, current);
}
const payload = [
  [home, 'payload/src/app/page.tsx'],
  [landingCss, 'payload/src/app/landing.css'],
];
for (const [, from] of payload) if (!fs.existsSync(resolve(from))) throw Error(`Payload manquant : ${from}`);

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = resolve(`nashra-backups/landing-${stamp}`);
fs.mkdirSync(backupDir, { recursive: true });
for (const filename of [...updated.keys(), dashboardOld]) {
  const destination = path.join(backupDir, ...filename.split('/'));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(resolve(filename), destination);
}
const changed = [];
try {
  for (const [filename, content] of updated) {
    fs.writeFileSync(resolve(filename), content, 'utf8');
    changed.push(filename);
  }
  fs.mkdirSync(path.dirname(resolve(dashboardNew)), { recursive: true });
  fs.renameSync(resolve(dashboardOld), resolve(dashboardNew));
  changed.push(dashboardNew);
  for (const [filename, from] of payload) {
    fs.copyFileSync(resolve(from), resolve(filename));
    changed.push(filename);
  }
  const manifest = { backup: path.relative(root, backupDir), files: [...updated.keys(),dashboardOld], created: [dashboardNew,home,landingCss], generatedSha256: Object.fromEntries(changed.filter(x => fs.existsSync(resolve(x))).map(x => [x,hash(fs.readFileSync(resolve(x)))])) };
  fs.writeFileSync(resolve('nashra-landing-install.json'), JSON.stringify(manifest,null,2)+'\n');
  console.log('✅ Landing page Nashra installée sur /');
  console.log('✅ Ancien dashboard conservé sur /dashboard');
  console.log('✅ Redirections et tutoriel mis à jour');
  console.log(`📁 Sauvegardes : ${manifest.backup}`);
  console.log('🔎 Lancer : node .\\verify-landing.cjs && npm run typecheck && npm run build');
} catch (error) {
  // Best effort rollback (only files touched in this transaction).
  for (const filename of changed.reverse()) {
    if (filename === dashboardNew) {
      if (fs.existsSync(resolve(dashboardNew))) fs.renameSync(resolve(dashboardNew), resolve(dashboardOld));
    } else if (filename === home || filename === landingCss) {
      if (fs.existsSync(resolve(filename))) fs.unlinkSync(resolve(filename));
    } else {
      const backup = path.join(backupDir, ...filename.split('/'));
      if (fs.existsSync(backup)) fs.copyFileSync(backup, resolve(filename));
    }
  }
  throw error;
}
