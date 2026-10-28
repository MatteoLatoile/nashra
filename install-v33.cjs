/** Nashra V3.3 - preflight first, Unicode-safe writes, backups, idempotent. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = process.cwd();
const payload = path.join(__dirname, 'v33-files');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname,'manifest-v33.json'),'utf8'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const utf8 = value => Buffer.from(value, 'utf8');
const changes = new Map();
const skipped = [];
const errors = [];
function pathInRoot(rel) { return path.join(root, ...rel.split('/')); }
function exists(rel) { return fs.existsSync(pathInRoot(rel)); }
function read(rel) { return fs.readFileSync(pathInRoot(rel), 'utf8'); }
function stage(rel, content) {
  const data = Buffer.isBuffer(content) ? content : utf8(content);
  if (exists(rel) && hash(fs.readFileSync(pathInRoot(rel))) === hash(data)) skipped.push(rel);
  else changes.set(rel, data);
}
function needs(rel) {
  if (!exists(rel)) errors.push(`Fichier requis manquant: ${rel}`);
}
// Only files that V3.3 depends on. We don't read or touch environment files.
for (const rel of ['src/components/shell.tsx','src/app/globals.css',
  'src/app/api/billing/webhook/route.ts','src/app/api/automation/queue/route.ts',
  'src/lib/i18n/catalog.json','src/app/(dashboard)/abonnement/page.tsx']) needs(rel);
for (const [rel, expected] of Object.entries(manifest.assets)) {
  const source = path.join(payload,...rel.split('/'));
  if (!fs.existsSync(source) || hash(fs.readFileSync(source)) !== expected) errors.push(`Archive endommagée : ${rel}`);
}
if (!errors.length) {
  for (const rel of manifest.newFiles) {
    const source = path.join(payload,...rel.split('/'));
    const content = fs.readFileSync(source);
    if (exists(rel) && hash(fs.readFileSync(pathInRoot(rel))) !== hash(content)) {
      errors.push(`Conflit : ${rel} existe et diffère, non écrasé`);
    } else stage(rel,content);
  }
  // Stripe: elevated entitlements only after a signature-checked subscription event.
  const webhook = 'src/app/api/billing/webhook/route.ts';
  let w = read(webhook);
  const mark = 'tierFromVerifiedTestSubscription';
  if (w.includes(mark)) skipped.push(webhook);
  else {
    const importAnchor = "import { verifyStripeSignature } from '@/lib/nashra-bundle/stripe';";
    const endAnchor = "      if (error) throw error;\n    }\n    return NextResponse.json({ received: true }, { headers: noStore });";
    if (!w.includes(importAnchor) || !w.includes(endAnchor) ||
        !w.includes("event.type === 'checkout.session.completed'")) errors.push(`${webhook} : structure du webhook inconnue`);
    else {
      w = w.replace(importAnchor, importAnchor + "\nimport { tierFromVerifiedTestSubscription } from '@/lib/billing/entitlements';");
      w = w.replace(endAnchor, `      if (error) throw error;
      // Server-side Stripe signature has been checked above. Never trust the browser's tier.
      // A matching TEST price and active/trialing status are both required.
      const tier = tierFromVerifiedTestSubscription(status, str(items?.data?.[0]?.price?.id));
      const { error: entitlementError } = await db.from('nashra_entitlements').upsert({
        user_id: uid, tier, updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      if (entitlementError) throw entitlementError;
    }
    return NextResponse.json({ received: true }, { headers: noStore });`);
      stage(webhook,w);
    }
  }
  // Avoid hiding quota errors behind the old generic 500 response.
  const queue = 'src/app/api/automation/queue/route.ts';
  let q = read(queue);
  if (q.includes('NASHRA_QUOTA_EXCEEDED')) skipped.push(queue);
  else {
    const anchor = "  } catch {\n    return NextResponse.json({ error: 'Opération impossible. Vérifiez les migrations et les permissions.' }, { status: 500, headers });\n  }";
    if (!q.includes(anchor)) errors.push(`${queue} : bloc d'erreur inconnu`);
    else {
      q = q.replace(anchor, `  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('NASHRA_QUOTA_EXCEEDED'))
      return NextResponse.json({ error: 'Limite du forfait atteinte. Libérez des tâches en attente ou consultez /limites.' }, { status: 409, headers });
    return NextResponse.json({ error: 'Opération impossible. Vérifiez les migrations et les permissions.' }, { status: 500, headers });
  }`);
      stage(queue,q);
    }
  }
  const shell = 'src/components/shell.tsx';
  let s = read(shell);
  if (s.includes("href: '/limites'")) skipped.push(shell);
  else {
    const anchor = "{ label: 'Abonnement', href: '/abonnement', Icon: CreditCard },";
    if (!s.includes(anchor)) errors.push(`${shell}: entrée Abonnement introuvable`);
    else stage(shell,s.replace(anchor,anchor+"\n  { label: 'Limites', href: '/limites', Icon: Activity },"));
  }
  const page = 'src/app/(dashboard)/abonnement/page.tsx';
  let p = read(page);
  const old1 = 'Les limites d’abonnement ne sont pas encore appliquées.';
  const old2 = 'La souscription, lorsqu’elle est activée en test, ne débloque pas encore de nouvelles fonctionnalités payantes.';
  const new1 = 'Les quotas de file d’attente sont désormais appliqués en base de données.';
  const new2 = 'Les droits Pro et Business sont reconnus uniquement après un événement Stripe de test vérifié.';
  if (p.includes(old1) || p.includes(old2)) {
    p = p.replace(old1,new1).replace(old2,new2);
    stage(page,p);
  } else if (p.includes(new1) && p.includes(new2)) skipped.push(page);
  else errors.push(`${page}: textes attendus introuvables`);
  const css = 'src/app/globals.css';
  let c = read(css);
  if (c.includes('/* Nashra V3.3 — entitlement dashboard */')) skipped.push(css);
  else stage(css,c.replace(/\s*$/,'')+'\n\n'+fs.readFileSync(path.join(payload,'limits-v33.css'),'utf8'));
  const catalog = 'src/lib/i18n/catalog.json';
  let json;
  try { json = JSON.parse(read(catalog)); } catch { errors.push(`${catalog}: JSON invalide`); }
  if (json) {
    const items = JSON.parse(fs.readFileSync(path.join(payload,'translations-v33.json'),'utf8'));
    let changed = false;
    for (const [key, entry] of Object.entries(items)) {
      if (!json[key]) { json[key] = entry; changed = true; }
      else for (const [locale, value] of Object.entries(entry)) {
        if (!json[key][locale]) { json[key][locale] = value; changed = true; }
      }
    }
    if (changed) stage(catalog,JSON.stringify(json,null,2)+'\n');
    else skipped.push(catalog);
  }
}
if (errors.length) {
  console.error('STOP - Nashra V3.3: aucun fichier modifié.\n - '+errors.join('\n - '));
  process.exit(1);
}
if (!changes.size) { console.log('Nashra V3.3 déjà installé : aucun changement.'); process.exit(0); }
const backup = path.join(root,'nashra-backups','v33-'+new Date().toISOString().replace(/[:.]/g,'-'));
for (const [rel] of changes) {
  if (!exists(rel)) continue;
  const destination = path.join(backup,...rel.split('/'));
  fs.mkdirSync(path.dirname(destination),{recursive:true});
  fs.copyFileSync(pathInRoot(rel),destination);
}
for (const [rel, bytes] of changes) {
  const target = pathInRoot(rel); fs.mkdirSync(path.dirname(target),{recursive:true});
  const temporary = target + '.nashra-v33-tmp';
  fs.writeFileSync(temporary,bytes); fs.renameSync(temporary,target);
  console.log('INSTALLED',rel);
}
console.log('\nNASHRA V3.3 OK ('+changes.size+' fichiers). Sauvegarde:',backup);
console.log('IMPORTANT: vérifiez SQL 004-008 puis appliquez SQL 009 (ne déclenche aucun paiement ou envoi).');
console.log('Puis : node .\\verify-v33.cjs && npm run typecheck');
