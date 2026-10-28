'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const src = name => path.join(root, 'src/lib/automation', name);
const supabaseUrl = 'https://example.supabase.co';
const owner = '123e4567-e89b-12d3-a456-426614174000';
const other = '999e4567-e89b-12d3-a456-426614174000';
const filename = '123e4567-e89b-12d3-a456-426614174001';
const buildURL = (uid = owner, name = filename) => `${supabaseUrl}/storage/v1/object/public/nashra-announcement-images/${uid}/${name}.jpg`;
let env = { NEXT_PUBLIC_SUPABASE_URL: supabaseUrl, NASHRA_AUTOMATION_ENABLED: '1', NASHRA_PUBLISHING_ENABLED: '1', SUPABASE_SERVICE_ROLE_KEY: 'local-test-only' };

function load(filename, mocks = {}) {
  const source = fs.readFileSync(src(filename), 'utf8');
  const js = ts.transpileModule(source, { fileName: filename, compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true,
  }, reportDiagnostics: true });
  const errors = (js.diagnostics || []).filter(x => x.category === ts.DiagnosticCategory.Error);
  assert.equal(errors.length, 0, `${filename} has syntax errors`);
  const module = { exports: {} };
  const requireLocal = name => {
    if (name in mocks) return mocks[name];
    throw Error(`Unexpected import from ${filename}: ${name}`);
  };
  new Function('module', 'exports', 'require', 'process', js.outputText)(module, module.exports, requireLocal, { env });
  return module.exports;
}
const photos = load('photos.ts');
const readinessModule = load('readiness.ts', { './photos': photos });
const { parseStoredPhotos, imageExtension } = photos;
const { readiness } = readinessModule;
const future = new Date(Date.now() + 60 * 60_000).toISOString();
function workspace(ad = {}, method = 'repost') {
  return {
    announcements: [{ id: 'a', body: 'Un test Nashra', imageUrls: [buildURL()], ...ad }],
    destinations: [{ id: 'd', name: 'Groupe de test autorisé', handle: '-1001234567890', authorized: true }],
    campaigns: [{ id: 'c', status: 'scheduled', method, announcementId: 'a', destinationIds: ['d'], scheduledAt: future }],
  };
}
const check = work => readiness(work).campaigns[0];
assert.equal(parseStoredPhotos([buildURL()], supabaseUrl, owner)[0].extension, 'jpg');
assert.throws(() => parseStoredPhotos([buildURL(other)], supabaseUrl, owner), /autre compte/);
assert.throws(() => parseStoredPhotos(['https://evil.example/a.jpg'], supabaseUrl, owner), /externe/);
assert.throws(() => parseStoredPhotos([buildURL()+'?evil=1'], supabaseUrl, owner), /externe/);
assert.throws(() => parseStoredPhotos([buildURL(), buildURL()], supabaseUrl, owner), /même photo/);
assert.throws(() => parseStoredPhotos(new Array(11).fill(buildURL()), supabaseUrl, owner), /entre 1 et 10/);
assert.throws(() => parseStoredPhotos([`${supabaseUrl}/storage/v1/object/public/nashra-announcement-images/${owner}/..%2foutside.jpg`], supabaseUrl, owner), /Chemin/);
assert.equal(imageExtension(Buffer.from([255, 216, 255, 1])), 'jpg');
assert.equal(imageExtension(Buffer.from([0, 1, 2, 3])), null);
assert.equal(check(workspace()).ready, true, 'Owned Supabase photo can be planned');
assert.equal(check(workspace({ body: '' })).ready, true, 'Album without caption is allowed');
assert.equal(check(workspace({ imageUrls: ['https://site.example/photo.jpg'] })).ready, false, 'External image not auto-published');
assert.equal(check(workspace({ body: 'x'.repeat(1025) })).ready, false, 'Telegram caption over 1024 blocked');
assert.equal(check(workspace({ imageUrls: new Array(11).fill(buildURL()) })).ready, false, 'Over 10 images blocked');
assert.equal(check(workspace({}, 'forward')).ready, false, 'Forward requires Telegram source');
assert.equal(check(workspace({ imageUrls: [], body: 'hello' })).ready, true, 'Plain text still supported');

const identity = { id: 'job-1', user_id: owner, campaign_id: 'c', announcement_id: 'a', destination_id: 'd', scheduled_at: future, method: 'repost', status: 'processing', job_key: `c:${future}:a:d` };
const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]);
async function runCase(ad = {}, opts = {}) {
  const events = [];
  const data = workspace(ad);
  let updated = null;
  const blob = new Blob([opts.fileBytes || jpg]);
  const db = {
    rpc: async name => { assert.equal(name, 'nashra_v24_claim_one'); return { data: [identity], error: null }; },
    from(name) { return {
      select() { return this; }, eq() { return this; },
      maybeSingle: async () => ({ data: name === 'workspaces' ? { data } : { session_ciphertext: 'encrypted-value' }, error: null }),
      update(changes) { updated = changes; return this; },
    }; },
    storage: { from(name) { assert.equal(name, photos.PHOTO_BUCKET); return {
      download: async key => { events.push('download'); return opts.storageError ? { data: null, error: new Error('storage error') } : { data: blob, error: null }; },
    }; } },
  };
  let sentFile = null;
  const telegramClient = {
    connect: async () => events.push('connect'),
    checkAuthorization: async () => true,
    disconnect: async () => events.push('disconnect'),
    sendFile: async (_, input) => { events.push('sendFile'); assert.ok(input.file); sentFile = input; return { id: 123 }; },
    sendMessage: async (_, input) => { events.push('sendMessage'); assert.ok(input.message); return { id: 124 }; },
  };
  const work = load('worker.ts', {
    '@supabase/supabase-js': { createClient: () => db },
    '@/lib/telegram-user/core': {
      Api: { Channel: class {} }, decrypt: value => value,
      makeClient: () => telegramClient,
      resolveDialog: async () => ({ isGroup: true, isChannel: false, entity: {} }),
    },
    './readiness': readinessModule,
    './photos': photos,
  });
  const result = await work.runOneDelivery();
  return { result, events, updated, sentFile };
}
(async () => {
  let x = await runCase();
  assert.equal(x.result.state, 'sent');
  assert.deepEqual(x.events, ['download', 'connect', 'sendFile', 'disconnect']);
  assert.equal(x.updated.telegram_message_id, 123);
  assert.equal(Buffer.isBuffer(x.sentFile.file), true, 'One photo is not sent as a group');
  assert.equal(x.sentFile.caption, 'Un test Nashra');

  const second = '123e4567-e89b-12d3-a456-426614174002';
  x = await runCase({ imageUrls: [buildURL(), buildURL(owner, second)] });
  assert.equal(x.result.state, 'sent');
  assert.equal(Array.isArray(x.sentFile.file), true, 'Two photos are sent as one album');
  assert.deepEqual(x.sentFile.caption, ['Un test Nashra', ''], 'Only the first photo has caption');

  x = await runCase({ imageUrls: [], body: 'Only text' });
  assert.equal(x.result.state, 'sent');
  assert.deepEqual(x.events, ['connect', 'sendMessage', 'disconnect']);

  x = await runCase({}, { storageError: true });
  assert.equal(x.result.state, 'blocked');
  assert.deepEqual(x.events, ['download']); // No Telegram call if a download fails.

  x = await runCase({ imageUrls: ['https://attacker.invalid/bad.jpg'] });
  assert.equal(x.result.state, 'blocked');
  assert.deepEqual(x.events, []);

  x = await runCase({ imageUrls: [buildURL(other)] });
  assert.equal(x.result.state, 'blocked');
  assert.deepEqual(x.events, []);

  x = await runCase({}, { fileBytes: Buffer.from('not an image') });
  assert.equal(x.result.state, 'blocked');
  assert.deepEqual(x.events, ['download']);

  env = { ...env, NASHRA_PUBLISHING_ENABLED: '0' };
  x = await runCase();
  assert.equal(x.result.state, 'disabled');
  assert.deepEqual(x.events, []);
  console.log('Nashra V3.7: 27 assertions et scénarios média réussis, aucun appel Telegram réel.');
})().catch(err => { console.error(err); process.exitCode = 1; });
