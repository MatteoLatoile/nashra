/** Nashra V3.2: all-or-nothing preflight, UTF-8, backup, no env or credential access. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = process.cwd();
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest-v32.json'), 'utf8'));
const from = path.join(__dirname, 'v32-files');
const checksum = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const toBuf = value => Buffer.from(value, 'utf8');
const stage = new Map();
const conflicts = [];
const skipped = [];
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const add = (rel,bytes) => {
  const target = path.join(root,rel);
  if (fs.existsSync(target) && checksum(fs.readFileSync(target)) === checksum(bytes)) skipped.push(rel);
  else stage.set(rel,bytes);
};
const required = ['src/components/shell.tsx', 'src/app/globals.css','src/lib/i18n/catalog.json'];
for (const rel of required) if (!fs.existsSync(path.join(root,rel))) conflicts.push(`Required file missing: ${rel}`);
for (const [rel,info] of Object.entries(manifest.files)) {
  const src = path.join(from,rel);
  if (!fs.existsSync(src)) throw Error(`Archive incomplete: ${rel}`);
  const bytes = fs.readFileSync(src);
  if (checksum(bytes) !== info.patched_sha256) throw Error(`Patch checksum mismatch: ${rel}`);
  const dest = path.join(root,rel);
  if (fs.existsSync(dest)) {
    const existingHash = checksum(fs.readFileSync(dest));
    if (existingHash === info.patched_sha256) { skipped.push(rel); continue; }
    if (existingHash !== info.previous_sha256) {
      conflicts.push(`${rel}: local modifications found; not overwritten`);
      continue;
    }
  } else if (info.previous_sha256) { conflicts.push(`${rel}: previous file missing`); continue; }
  add(rel,bytes);
}
for (const [name,hash] of Object.entries(manifest.assets)) {
  const file = path.join(from,name);
  if (!fs.existsSync(file) || checksum(fs.readFileSync(file)) !== hash) throw Error(`Invalid asset: ${name}`);
}
if (!conflicts.length) {
  const nav = 'src/components/shell.tsx';
  const shell = read(nav);
  if (shell.includes("href: '/supervision'")) skipped.push(nav);
  else if (!shell.includes("{ label: 'Diagnostic', href: '/diagnostics', Icon: Activity },")) conflicts.push(`${nav}: missing insertion anchor`);
  else add(nav,toBuf(shell.replace("{ label: 'Diagnostic', href: '/diagnostics', Icon: Activity },", "{ label: 'Supervision', href: '/supervision', Icon: Activity },\n  { label: 'Diagnostic', href: '/diagnostics', Icon: Activity },")));
  const styles = 'src/app/globals.css', css = read(styles), extra = fs.readFileSync(path.join(from,'supervision.css'),'utf8');
  if (css.includes('/* Nashra v3.2 supervision')) skipped.push(styles);
  else add(styles,toBuf(css.replace(/\s*$/, '')+'\n\n'+extra));
  const translations = 'src/lib/i18n/catalog.json';
  let catalog;
  try { catalog = JSON.parse(read(translations)); }
  catch { conflicts.push('Invalid JSON in src/lib/i18n/catalog.json'); }
  if (catalog) {
    const added = JSON.parse(fs.readFileSync(path.join(from,'translations-v32.json'),'utf8'));
    let changed = false;
    for (const [key,entries] of Object.entries(added)) {
      if (!catalog[key]) { catalog[key]=entries; changed=true; continue; }
      // Preserve any local translations; fill missing languages only.
      for (const [lang,value] of Object.entries(entries)) {
        if (!catalog[key][lang]) { catalog[key][lang]=value; changed=true; }
      }
    }
    if (changed) add(translations,toBuf(JSON.stringify(catalog,null,2)+'\n'));
    else skipped.push(translations);
  }
}
if (conflicts.length) {
  console.error('\nSTOP: No files changed. Existing project differs from the tested V3.1 base:\n - '+conflicts.join('\n - '));
  process.exit(1);
}
if (!stage.size) { console.log('Nashra V3.2 already installed. Nothing to do.'); process.exit(0); }
const backup = path.join(root,'nashra-backups','v32-'+new Date().toISOString().replace(/[:.]/g,'-'));
for (const rel of stage.keys()) {
  const original = path.join(root,rel);
  if (!fs.existsSync(original)) continue;
  const safe = path.join(backup,rel);fs.mkdirSync(path.dirname(safe),{recursive:true});fs.copyFileSync(original,safe);
}
for (const [rel,bytes] of stage) {
  const dest=path.join(root,rel);fs.mkdirSync(path.dirname(dest),{recursive:true});
  const tmp=dest+'.nashra-v32-tmp';fs.writeFileSync(tmp,bytes);fs.renameSync(tmp,dest);
  console.log('INSTALLED',rel);
}
console.log('\nNASHRA V3.2: '+stage.size+' files installed or updated.');
console.log('Backups:',backup);
console.log('Next: apply supabase/008_queue_reliability.sql in Supabase SQL Editor.');
console.log('Then: node .\\verify-v32.cjs && node .\\nashra-tests\\reliability.test.cjs && npm run typecheck');
