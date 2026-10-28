/* Nashra V3.5 — installation idempotente, avec sauvegarde et controles pre-ecriture. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = process.cwd();
const source = path.join(root, 'v35-files');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = path.join(root, 'nashra-backups', 'v35-' + stamp);
const rel = (...items) => path.join(root, ...items);
const read = name => fs.readFileSync(name, 'utf8');
const staging = [];
const stage = (name, data, policy = 'new') => {
  const target = rel(name);
  const old = fs.existsSync(target) ? read(target) : null;
  if (old === data) return;
  if (old !== null && policy === 'new') throw new Error('Refus de remplacer un fichier existant modifie : ' + name);
  staging.push({name, target, old, data});
};
const requireFile = name => {
  if (!fs.existsSync(rel(name))) throw new Error('Pre-requis absent : '+name + '. Installez V3.4 (et V3.2 pour le Cron) avant V3.5.');
  return read(rel(name));
};
function replaceOnce(s, needle, replacement, label) {
  const count = s.split(needle).length-1;
  if (count !== 1) throw new Error('Patch Cron non applicable ('+label+', occurrences '+count+'). Aucun fichier modifie.');
  return s.replace(needle,replacement);
}
try {
  requireFile('src/lib/nashra-admin/guards.ts');
  requireFile('src/lib/nashra-bundle/secure.ts');
  const app = requireFile('src/app/(dashboard)/admin/page.tsx');
  if (!app.includes('NASHRA_ADMIN_V34')) throw new Error('Console admin V3.4 non reconnue, aucun fichier modifie.');
  const cron = requireFile('src/app/api/cron/nashra/route.ts');
  if (!cron.includes('runOneDelivery')) throw new Error('Route Cron non reconnue, aucun fichier modifie.');
  if (!cron.includes('recordWorkerRun')) {
    let patched = cron;
    patched = replaceOnce(patched,
      "import { runOneDelivery } from '@/lib/automation/worker';",
      "import { runOneDelivery } from '@/lib/automation/worker';\nimport { recordWorkerRun } from '@/lib/nashra-monitor/telemetry';", 'import');
    patched = replaceOnce(patched,
      "  try {\n    // Strictly one job per invocation.",
      "  const startedAt = Date.now();\n  try {\n    // Strictly one job per invocation.", 'debut');
    patched = replaceOnce(patched,
      "    return NextResponse.json({ ...result, reconciliation },",
      "    await recordWorkerRun({ state: result.state, startedAt, reconciliation });\n    return NextResponse.json({ ...result, reconciliation },", 'succes');
    patched = replaceOnce(patched,
      "  } catch {\n    return NextResponse.json({ error: 'Worker indisponible.",
      "  } catch {\n    await recordWorkerRun({ state: 'error', startedAt });\n    return NextResponse.json({ error: 'Worker indisponible.", 'echec');
    stage('src/app/api/cron/nashra/route.ts', patched, 'update');
  }
  if (!app.includes('n35-adminlink')) {
    const modified = replaceOnce(app,
      '  return <div className="n34-root">',
      '  return <div className="n34-root">\n    <div className="n35-adminlink"><a href="/surveillance-systeme">Santé du système ↗</a><span>Suivi du Cron, migrations et incidents — lecture seule</span></div>',
      'raccourci admin');
    stage('src/app/(dashboard)/admin/page.tsx', modified, 'update');
  }
  const cssPath = 'src/app/globals.css';
  const css = requireFile(cssPath);
  if (!css.includes('NASHRA_V35_STYLES_START')) {
    const extra = read(path.join(source,'monitor-v35.css'));
    stage(cssPath,css+'\n\n'+extra+'\n.n35-adminlink{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin:0 0 18px;padding:13px 16px;border:1px solid #35373d;background:#1c1e22;border-radius:9px;color:#92969e;font-size:10.5px}.n35-adminlink a{font-size:11px;font-weight:750;color:#fff;text-decoration:underline;text-underline-offset:3px}\n','update');
  }
  const newFiles = [
    'src/lib/nashra-monitor/telemetry.ts',
    'src/app/api/admin/v35/route.ts',
    'src/app/api/admin/v35/export/route.ts',
    'src/app/(dashboard)/surveillance-systeme/page.tsx',
    'supabase/011_worker_monitor.sql',
  ];
  for (const name of newFiles) stage(name,read(path.join(source,name)));
  // Validate everything BEFORE writing any modified project file.
  for (const item of staging) {
    if (item.old !== null) {
      const bpath = path.join(backup,item.name);
      fs.mkdirSync(path.dirname(bpath),{recursive:true});
      fs.writeFileSync(bpath,item.old,'utf8');
    }
  }
  for (const item of staging) {
    fs.mkdirSync(path.dirname(item.target),{recursive:true});
    fs.writeFileSync(item.target,item.data,'utf8');
    console.log('UPDATED',item.name);
  }
  if (!staging.length) console.log('V3.5 deja installee, aucun changement necessaire.');
  console.log('\nNASHRA V3.5 INSTALLEE. Fichiers :',staging.length);
  console.log('Sauvegardes :',backup);
  console.log('ETAPES : node .\\verify-v35.cjs ; npm run typecheck ; SQL 011 dans Supabase');
  console.log('TEST : /surveillance-systeme avec votre compte administrateur.');
} catch(e) { console.error('INSTALLATION ANNULEE :',e.message);process.exitCode=1; }
