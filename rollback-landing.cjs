// Restore the previous Nashra routing and source files from installer backups.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=process.cwd();
const p=file=>path.join(root,...file.split('/'));
const manifestPath=p('nashra-landing-install.json');
if(!fs.existsSync(manifestPath))throw Error('Aucune installation landing enregistrée.');
const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(p(file))).digest('hex');
for(const [file,expect] of Object.entries(manifest.generatedSha256)){
  if(!fs.existsSync(p(file))||sha(file)!==expect)throw Error(`Fichier modifié depuis l'installation : ${file}. Retour arrière annulé.`);
}
for(const original of manifest.files){
 const backup=path.join(root,manifest.backup,...original.split('/'));
 if(!fs.existsSync(backup))throw Error(`Sauvegarde absente : ${backup}`);
}
for(const file of manifest.created)fs.rmSync(p(file),{force:true});
for(const original of manifest.files){
 const backup=path.join(root,manifest.backup,...original.split('/'));
 fs.mkdirSync(path.dirname(p(original)),{recursive:true});
 fs.copyFileSync(backup,p(original));
}
fs.unlinkSync(manifestPath);
console.log('✅ Ancien accueil et ancien dashboard restaurés.');
