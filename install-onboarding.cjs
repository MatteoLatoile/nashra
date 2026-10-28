/** Nashra onboarding v1.1. Run from the EXISTING Next.js project directory. */
const fs = require('node:fs');
const path = require('node:path');
const root = process.cwd();
const time = new Date().toISOString().replace(/[:.]/g, '-');
const backups = path.join(root, 'nashra-backups', `onboarding-${time}`);
let updated = 0;
const file = p => path.join(root, p);
function edit(relative, transform, required = true) {
  const full = file(relative);
  if (!fs.existsSync(full)) {
    if (required) throw Error(`Required file missing: ${relative}`);
    console.warn('OPTIONAL FILE MISSING:', relative); return;
  }
  const original = fs.readFileSync(full, 'utf8');
  const next = transform(original);
  if (original === next) return console.log('UNCHANGED',relative);
  fs.mkdirSync(path.dirname(path.join(backups,relative)), {recursive:true});
  fs.copyFileSync(full,path.join(backups,relative));
  fs.writeFileSync(full,next,'utf8');
  console.log('UPDATED',relative); updated++;
}
function addClientImport(source, statement) {
  if (source.includes(statement)) return source;
  const directive = /^([\s\uFEFF]*['"]use client['"];?)/;
  if (!directive.test(source)) throw Error('Component does not begin with use client: refusing unsafe import injection');
  return source.replace(directive, '$1\n' + statement);
}
try {
  for (const required of ['src/app/bienvenue/page.tsx','src/app/bienvenue/onboarding-flow.tsx','src/app/bienvenue/copy.ts','src/components/onboarding-link.tsx', 'src/lib/i18n/provider.tsx']) {
    if (!fs.existsSync(file(required))) throw Error(`Extract ZIP into Nashra project root first: ${required}`);
  }
  edit('src/app/(dashboard)/layout.tsx', s => {
    if (s.includes('nashra_onboarding_status')) return s;
    const marker = '  const userId = data.claims.sub;';
    if (!s.includes(marker)) throw Error('Cannot locate dashboard authorization marker. No changes made to this file.');
    return s.replace(marker, `  // Existing accounts see this guide once; "Skip for now" enables the dashboard.
  const { data: onboardingData, error: onboardingError } = await supabase.auth.getUser();
  if (onboardingError || !onboardingData.user) redirect('/connexion');
  const onboardingStatus = onboardingData.user.user_metadata?.nashra_onboarding_status;
  if (onboardingStatus !== 'completed' && onboardingStatus !== 'skipped') redirect('/bienvenue');
${marker}`);
  });
  edit('src/components/shell.tsx', s => {
    s = addClientImport(s, "import { OnboardingNavLink } from '@/components/onboarding-link';");
    if (s.includes('<OnboardingNavLink')) return s;
    const marker = '<Link href="/parametres"';
    if (!s.includes(marker)) throw Error('Cannot find sidebar settings menu; refusing blind changes.');
    return s.replace(marker, '<OnboardingNavLink onNavigate={() => setMobileOpen(false)} />\n        ' + marker);
  });
  edit('src/components/account-menu.tsx', s => {
    s = addClientImport(s, "import { OnboardingAccountLink } from '@/components/onboarding-link';");
    if (s.includes('<OnboardingAccountLink')) return s;
    const marker = '<Link href="/parametres" onClick={close} role="menuitem">';
    if (!s.includes(marker)) {
      console.warn('Profile menu format differs; guide remains accessible from sidebar.');
      return s;
    }
    return s.replace(marker,'<OnboardingAccountLink onNavigate={close} />\n            ' + marker);
  },false);
  edit('src/app/layout.tsx', s => {
    if (s.includes('<I18nProvider>')) return s;
    if (!s.includes("import { I18nProvider }")) s = "import { I18nProvider } from '@/lib/i18n/provider';\n" + s;
    const next = s.replace(/<body(\s[^>]*)?>(\s*)\{children\}(\s*)<\/body>/,(_,attrs='',a,b)=> `<body${attrs}>${a}<I18nProvider>{children}</I18nProvider>${b}</body>`);
    if (next === s) throw Error('Cannot locate <body>{children}</body>. Complete i18n installer first.');
    return next;
  });
  edit('src/app/globals.css', s => {
    const marker = '/* Nashra onboarding v1.1';
    if (s.includes(marker)) return s;
    return s + '\n' + fs.readFileSync(file('onboarding.css'), 'utf8') + '\n';
  });
  console.log('\nOnboarding installed. Modified:',updated,'files.');
  console.log('Backups:', backups);
  console.log('Run: npm run typecheck');
  console.log('Test: sign out, sign in, then visit /bienvenue');
} catch (e) {
  console.error('\nINSTALLATION FAILED:',e.message);
  console.error('Backups for files already edited:',backups);
  process.exitCode = 1;
}
