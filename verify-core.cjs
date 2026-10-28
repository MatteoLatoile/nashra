'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=process.cwd();
const h=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const manifest=JSON.parse(fs.readFileSync('nashra-core-payload/manifest.json','utf8'));
let okay=true;
for(const f of manifest){
 const target=path.join(root,f.path);
 if(!fs.existsSync(target)||h(target)!==f.new_sha256){console.error('DIFFERENT : '+f.path);okay=false;}
}
const legacy=fs.readFileSync('src/app/api/telegram/user/publish/route.ts','utf8');
const telegram=fs.readFileSync('src/app/(dashboard)/telegram/page.tsx','utf8');
const modern=fs.readFileSync('src/app/api/telegram/user/publish-announcement/route.ts','utf8');
const queue=fs.readFileSync('src/lib/automation/worker.ts','utf8');
const important=[
 ['ancien envoi désactivé', /status:\s*410/.test(legacy) && !/withClient|sendMessage|forwardMessages/.test(legacy)],
 ['import et connexion Telegram conservés', /importMessage/.test(telegram) && /sendCode/.test(telegram) && /\/annonces/.test(telegram)],
 ['un seul chemin de publication depuis annonce', /nashra_manual_claim/.test(modern) && /sendWithPersonalAccount/.test(modern)],
 ['planification conservée',/nashra_v24_claim_one/.test(queue)],
 ['profil conservé',fs.existsSync('src/app/(dashboard)/profil/page.tsx')],
];
for(const [name,passed] of important){console.log(`${passed?'OK':'ERREUR'} : ${name}`);if(!passed)okay=false;}
if(!okay)process.exit(1);
console.log('OK : correctif cohérent. Compiler et tester sur votre PC.');
