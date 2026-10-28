'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = process.cwd();
const payload = path.join(root, 'nashra-finish-payload');
const manifest = JSON.parse(fs.readFileSync(path.join(payload,'manifest.json'),'utf8'));
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
let wrong = 0;
for (const entry of manifest) {
  const file = path.join(root, entry.path);
  const ok = fs.existsSync(file) && sha(file) === entry.new_sha256;
  if(!ok) { console.error('MISMATCH',entry.path); wrong++; }
}
const shouldContain = [
 ['src/components/shell.tsx',"href: '/annonces'"],
 ['src/app/api/automation/calendar/route.ts',"status: 'approved'"],
 ['src/app/api/telegram/user/publish-announcement/route.ts',"nashra_manual_claim"],
 ['src/app/(dashboard)/historique/page.tsx',"/api/automation/queue"],
 ['src/app/(dashboard)/annonces/page.tsx',"Publier maintenant"],
];
for (const [file, token] of shouldContain) {
  if (!fs.readFileSync(path.join(root,file),'utf8').includes(token)) { console.error('MISSING',file,token);wrong++; }
}
// TypeScript is a devDependency in Nashra. Verify syntax without launching Next.js.
try {
  const ts = require('typescript');
  for (const entry of manifest.filter(e => /\.tsx?$/.test(e.path))) {
    const file = path.join(root, entry.path);
    const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const source = ts.createSourceFile(file, fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,kind);
    if(source.parseDiagnostics.length) { console.error('TS syntax error',entry.path);wrong++; }
  }
} catch { console.log('Syntaxe TypeScript non testée ici : la commande npm run typecheck reste indispensable.'); }
if(wrong) { console.error(`${wrong} contrôles échoués`);process.exit(1); }
console.log(`✅ ${manifest.length} fichiers vérifiés ; parcours, historique, calendrier et SQL présents.`);
console.log('⚠️ Testez ensuite npm run typecheck, npm run build et Supabase/Telegram réels.');
