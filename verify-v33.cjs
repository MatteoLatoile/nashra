/** Read-only verifications. No credentials or network requests. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = process.cwd();
const required = [
  'src/app/(dashboard)/limites/page.tsx',
  'src/app/api/billing/limits/route.ts',
  'src/lib/billing/entitlements.ts',
  'supabase/009_subscription_limits.sql',
  'supabase/DIAGNOSTIC_MIGRATIONS.sql',
];
let failures = 0;
function pass(label, cond) {
  console.log((cond ? 'OK  ' : 'FAIL')+' '+label);
  if (!cond) failures++;
}
function read(file) {
  const loc = path.join(root,...file.split('/'));
  return fs.existsSync(loc) ? fs.readFileSync(loc,'utf8') : '';
}
for (const file of required) pass('Fichier '+file, Boolean(read(file)));
pass('Navigation quotas',read('src/components/shell.tsx').includes("href: '/limites'"));
pass('SQL: enforcement via trigger',read('supabase/009_subscription_limits.sql').includes('NASHRA_QUOTA_EXCEEDED'));
pass('SQL: précontrôles attempted_at',read('supabase/009_subscription_limits.sql').includes("column_name='attempted_at'"));
pass('Webhook: droits seulement après événement Stripe signé',
  read('src/app/api/billing/webhook/route.ts').includes('verifyStripeSignature(') &&
  read('src/app/api/billing/webhook/route.ts').includes('tierFromVerifiedTestSubscription('));
pass('API quotas lit session authentifiée',read('src/app/api/billing/limits/route.ts').includes('await session()'));
pass('API queue signale dépassement',read('src/app/api/automation/queue/route.ts').includes('NASHRA_QUOTA_EXCEEDED'));
const catalog = JSON.parse(read('src/lib/i18n/catalog.json') || '{}');
const item = catalog['Quotas et utilisation'];
pass('Traduction dans les 10 autres langues',Boolean(item && ['en','ar','ru','es','it','de','id','fil','tr','ur'].every(k=>item[k])));
try {
  const ts = require('typescript');
  const tsFiles = [...required.filter(n => /\.tsx?$/.test(n)),'src/app/api/billing/webhook/route.ts',
    'src/app/api/automation/queue/route.ts','src/components/shell.tsx'];
  for (const rel of tsFiles) {
    const source = read(rel);
    const sf = ts.createSourceFile(rel,source,ts.ScriptTarget.Latest,true,rel.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
    pass('Syntaxe '+rel,!sf.parseDiagnostics.length);
  }
} catch(e) {
  console.warn('Note: analyse TypeScript ignorée (npm install requis).');
}
console.log('\nBilan:',failures?'PROBLÈMES':'Vérifications statiques réussies');
process.exitCode = failures ? 1 : 0;
