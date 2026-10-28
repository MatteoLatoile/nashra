// Nashra multilingual patch installer. Run once in the existing Nashra project.
// Node.js handles UTF-8 natively; no PowerShell Get-Content/Set-Content.
const fs = require('node:fs');
const path = require('node:path');
const root = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(root, `.nashra-i18n-backup-${stamp}`);
const writes = [];
function modify(relative, transform) {
  const full = path.join(root, relative);
  if (!fs.existsSync(full)) throw Error(`Missing source file: ${relative}`);
  const before = fs.readFileSync(full, 'utf8');
  const after = transform(before);
  if (after === before) { console.log(`SKIP ${relative}`); return; }
  fs.mkdirSync(path.dirname(path.join(backupDir, relative)), { recursive: true });
  fs.copyFileSync(full, path.join(backupDir, relative));
  fs.writeFileSync(full, after, 'utf8');
  writes.push(relative);
  console.log(`UPDATED ${relative}`);
}
const here = (...s) => path.join(root, ...s);
const rootLayout = 'src/app/layout.tsx';
const settingsPage = 'src/app/(dashboard)/parametres/page.tsx';
try {
  if (!fs.existsSync(here('src/lib/i18n/provider.tsx'))) throw Error('Missing i18n provider. Unzip first.');
  modify(rootLayout, source => {
    let s = source;
    if (!s.includes('import { I18nProvider }')) {
      s = `import { I18nProvider } from '@/lib/i18n/provider';\n` + s;
    }
    // Server root layout must remain a Server Component; a client provider inside it is safe.
    if (!s.includes('<I18nProvider>')) {
      const next = s.replace(/<body(\s[^>]*)?>(\s*)\{children\}(\s*)<\/body>/,
        (_, attrs = '', w1, w2) => `<body${attrs}>${w1}<I18nProvider>{children}</I18nProvider>${w2}</body>`);
      if (next === s) throw Error('Cannot locate <body>{children}</body> in root layout.');
      s = next;
    }
    return s;
  });
  modify(settingsPage, source => {
    let s = source;
    if (!s.includes("import { LanguageSettingsCard }")) {
      const first = s.indexOf('\n');
      s = s.slice(0, first+1) + "import { LanguageSettingsCard } from '@/components/language-settings';\n" + s.slice(first+1);
    }
    if (!s.includes('<LanguageSettingsCard')) {
      const pattern = /(<PageHeader\b[^<>]*\/>)/;
      if (!pattern.test(s)) throw Error('Cannot locate PageHeader in Settings page.');
      s = s.replace(pattern, '$1\n    <LanguageSettingsCard />');
    }
    return s;
  });
  const accountMenu = 'src/components/account-menu.tsx';
  if (fs.existsSync(here(accountMenu))) {
    modify(accountMenu, s => {
      if (s.includes('href="/parametres#langue"')) return s;
      const anchor = '<Link href="/parametres" onClick={close} role="menuitem">';
      if (s.includes(anchor)) {
        const extra = '<Link href="/parametres#langue" onClick={close} role="menuitem">\n              <Settings2 size={17} />\n              <span>Langue</span>\n            </Link>\n            ';
        return s.replace(anchor, extra + anchor);
      }
      return s;
    });
  }
  modify('src/app/globals.css', s => {
    const marker = '/* Nashra multilingual settings — isolated component styles */';
    if (s.includes(marker)) return s;
    return s + '\n\n' + fs.readFileSync(here('language.css'), 'utf8') + '\n';
  });
  // Existing date formatting was hard-coded to French; adapt it to the selected UI locale.
  modify('src/lib/store.tsx', s => {
    if (s.includes('localeForIntl')) return s;
    const localeImport = "import { isLocale, localeForIntl } from '@/lib/i18n';\n";
    if (!s.includes("from '@/lib/i18n'")) {
      const first = s.indexOf('\n');
      s = s.slice(0,first+1) + localeImport + s.slice(first+1);
    }
    // Only replace literal locale in helpers. The developer-defined dateFR name stays the same.
    const start = s.indexOf('export function dateFR(');
    if (start !== -1) {
      let tail = s.slice(start);
      tail = tail.replaceAll("'fr-FR'", "localeForIntl(isLocale(typeof document !== 'undefined' ? document.documentElement.lang : null) ? document.documentElement.lang as import('@/lib/i18n').Locale : 'fr')");
      s = s.slice(0,start) + tail;
    }
    return s;
  });
  // Keep existing dynamic dates in the current UI locale too.
  const clientPages = [
    'src/app/(dashboard)/campagnes/page.tsx',
    'src/app/(dashboard)/historique/page.tsx',
    'src/app/(dashboard)/telegram/page.tsx',
    'src/app/(dashboard)/annonces/page.tsx',
    'src/app/(dashboard)/groupes/page.tsx',
  ];
  for (const relative of clientPages) {
    if (!fs.existsSync(here(relative))) continue;
    modify(relative, original => {
      if (!original.includes("'use client'") && !original.includes('"use client"')) return original;
      return original.replaceAll("toLocaleDateString('fr-FR'", "toLocaleDateString(document.documentElement.lang || 'fr'")
        .replaceAll("toLocaleTimeString('fr-FR'", "toLocaleTimeString(document.documentElement.lang || 'fr'");
    });
  }
  console.log('\nINSTALLATION FINISHED; backups:', backupDir);
  console.log('Run: npm run typecheck; then restart Next.js and open /parametres#langue.');
} catch (e) {
  console.error('\nINSTALLER ERROR:', e.message);
  console.error('Modified files:', writes.join(', ') || 'none');
  console.error('Backups:', backupDir);
  process.exitCode = 1;
}
