const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
function read(file) {return fs.readFileSync(path.join(process.cwd(),file),'utf8');}
assert(!fs.existsSync('src/app/(dashboard)/page.tsx'), 'Ancienne route / encore présente');
assert(read('src/app/page.tsx').includes('lp-root'), 'Landing page manquante');
assert(read('src/app/(dashboard)/dashboard/page.tsx').includes('export default function Dashboard'), 'Dashboard absent');
assert(read('src/components/shell.tsx').includes("href: '/dashboard'"), 'Menu pas redirigé vers /dashboard');
assert(read('src/components/dashboard-tour.tsx').includes("pathname !== '/dashboard'"), 'Tutoriel encore sur /');
assert(!read('src/components/dashboard-tour.tsx').includes("path: '/'"), 'Étapes de tutoriel sur l’ancienne route');
assert(read('src/app/connexion/page.tsx').includes("redirect('/dashboard')"), 'Redirection authentifiée non actualisée');
assert(read('src/app/landing.css').includes('.lp-plan'), 'Style tarifs absent');
assert(read('src/app/page.tsx').includes('NEXT_PUBLIC_NASHRA_DOWNLOAD_URL'), 'Bouton télécharger non configurable');
assert(read('src/app/page.tsx').includes('150') && read('src/app/page.tsx').includes('300'), 'Limites de forfaits incomplètes');
console.log('✅ NASHRA_LANDING_OK : accueil, dashboard, tutoriel, prix et téléchargement vérifiés.');
