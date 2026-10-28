const fs=require('node:fs');const path=require('node:path');
const base=process.cwd();const expected=JSON.parse(fs.readFileSync(path.join(__dirname,'manifest-bundle.json'),'utf8'));
let failed=0;for(const [rel] of Object.entries(expected)){
 if(!fs.existsSync(path.join(base,rel))) {console.error('ABSENT',rel);failed++;}
}
let ts;try{ts=require('typescript');}catch{console.warn('TypeScript non disponible, npm run typecheck requis.');}
if(ts){for(const rel of Object.keys(expected).filter(s=>/\.tsx?$/.test(s))){
 const abs=path.join(base,rel);if(!fs.existsSync(abs))continue;
 const sf=ts.createSourceFile(rel,fs.readFileSync(abs,'utf8'),ts.ScriptTarget.Latest,true,rel.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 if(sf.parseDiagnostics.length){failed+=sf.parseDiagnostics.length;console.error('ERREUR',rel,sf.parseDiagnostics.map(x=>x.messageText).join(' | '));}
}}
console.log(failed?'V2.7 : verification en echec.':'V2.7 : fichiers et syntaxe de base valides.');
process.exitCode=failed?1:0;
