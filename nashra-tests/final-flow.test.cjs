'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function source(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function requireTS(rel) {
  const filename = path.join(root, rel);
  const js = ts.transpileModule(source(rel), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = module.paths;
  mod.require = function(spec) {
    if (spec.startsWith('@/')) return requireTS('src/' + spec.slice(2) + (spec.endsWith('.ts') ? '' : '.ts'));
    if (spec.startsWith('./') || spec.startsWith('../')) return requireTS(path.relative(root, path.resolve(path.dirname(filename), spec + (spec.endsWith('.ts') ? '' : '.ts'))));
    return require(spec);
  };
  mod._compile(js,filename);
  return mod.exports;
}
const PREFIX = 'https://test-project.supabase.co/storage/v1/object/public/nashra-announcement-images/';
const USER='11111111-1111-4111-8111-111111111111';
const PHOTO='22222222-2222-4222-8222-222222222222';

test('All source TS / TSX files parse without syntax errors', () => {
  let files = 0;
  function check(dir) {
    for (const item of fs.readdirSync(dir,{ withFileTypes: true })) {
      const file = path.join(dir, item.name);
      if (item.isDirectory()) check(file);
      else if (/\.tsx?$/.test(file)) {
        const code = fs.readFileSync(file, 'utf8');
        const parsed = ts.transpileModule(code, {fileName:file, reportDiagnostics:true, compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext}});
        const errors=(parsed.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error);
        assert.equal(errors.length,0, `${file}: ${errors.map(x=>ts.flattenDiagnosticMessageText(x.messageText, ' ')).join('; ')}`);
        files++;
      }
    }
  }
  check(path.join(root,'src'));
  assert.ok(files > 50, 'Unexpectedly few source files');
  console.log('Typescript / TSX parsed:', files);
});

test('Imported photos must belong to the owner and cannot be arbitrary HTTPS links', () => {
  const {parseStoredPhotos, PhotoReferenceError} = requireTS('src/lib/automation/photos.ts');
  assert.deepEqual(parseStoredPhotos([PREFIX+USER+'/'+PHOTO+'.png'], 'https://test-project.supabase.co', USER),[{key:USER+'/'+PHOTO+'.png', extension:'png'}]);
  assert.throws(()=>parseStoredPhotos(['https://other.example/photo.png'], 'https://test-project.supabase.co',USER),PhotoReferenceError);
  assert.throws(()=>parseStoredPhotos([PREFIX+'33333333-3333-4333-8333-333333333333/'+PHOTO+'.png'],'https://test-project.supabase.co',USER),PhotoReferenceError);
  assert.throws(()=>parseStoredPhotos(Array.from({length:11},()=>PREFIX+USER+'/'+PHOTO+'.png'),'https://test-project.supabase.co',USER),PhotoReferenceError);
});

test('Scheduled local text allowed; unauthorized destination blocked', () => {
  const prev=process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL='https://test-project.supabase.co';
  try {
    const {readiness} = requireTS('src/lib/automation/readiness.ts');
    const example={announcements:[{id:'a1',title:'Test',body:'Hello world'}],destinations:[{id:'d1',name:'Test Group',handle:'-1001234567890',authorized:true}],campaigns:[{id:'c1',name:'Test',status:'scheduled',method:'repost',announcementId:'a1',destinationIds:['d1'],scheduledAt:new Date(Date.now()+3_600_000).toISOString()}]};
    assert.equal(readiness(example).totals.ready, 1);
    example.destinations[0].authorized=false;
    assert.equal(readiness(example).totals.blocked, 1);
    example.destinations[0].authorized=true;
    example.campaigns[0].method='forward';
    assert.equal(readiness(example).totals.blocked, 1);
  } finally { if(prev===undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL=prev; }
});

test('Only one manual publisher route remains active and results are in queue', () => {
  const old=source('src/app/api/telegram/user/publish/route.ts');
  assert.match(old,/410/);
  const current=source('src/app/api/telegram/user/publish-announcement/route.ts');
  assert.match(current,/nashra_manual_claim/);
  assert.match(current,/confirmed\s*!==\s*true/);
  const history=source('src/app/(dashboard)/historique/page.tsx');
  assert.match(history,/\/api\/automation\/queue/);
  const calendar=source('src/app/(dashboard)/campagnes/page.tsx');
  assert.match(calendar,/\/api\/automation\/calendar/);
});
