'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const readyFile = path.join(root, 'src/lib/automation/readiness.ts');
const workerFile = path.join(root, 'src/lib/automation/worker.ts');
const source = fs.readFileSync(readyFile, 'utf8');
const output = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
}}).outputText;
const moduleExports = {};
vm.runInNewContext(output, { exports: moduleExports, Date, Set, Map }, { filename: 'readiness.js' });
const { readiness } = moduleExports;
assert.equal(typeof readiness, 'function');
const at = new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString();
function fixture({ method = 'repost', ad = {}, authorized = true, status = 'scheduled' } = {}) {
  return { announcements: [{ id: 'a', body: 'Un texte d’annonce.', ...ad }],
    destinations: [{ id: 'd', name: 'Test', handle: '-1001234567890', authorized }],
    campaigns: [{ id: 'c', name: 'Test', status, method,
      announcementId: 'a', destinationIds: ['d'], scheduledAt: at }],
  };
}
function result(fixtureData) { return readiness(fixtureData).campaigns[0]; }
assert.equal(result(fixture()).ready, true, 'Native text repost must be ready without source');
assert.equal(result(fixture({method:'forward'})).ready, false, 'Forward needs a Telegram source');
assert.equal(result(fixture({ ad: { body: '', imageUrls: [] } })).ready, false, 'Empty post rejected');
assert.equal(result(fixture({ ad: { imageUrls: ['https://images.example/a.jpg'] } })).ready, false, 'No silent image drop');
assert.equal(result(fixture({ ad: { sourceChatId: '-1001234567891', sourceMessageId: 456, imageUrls: ['https://images.example/a.jpg'] } })).ready, true, 'Source media remains supported');
assert.equal(result(fixture({ method:'forward', ad: { sourceChatId: '-1001234567891', sourceMessageId: 456 } })).ready, true, 'Forward with source remains supported');
assert.equal(result(fixture({ ad: { sourceChatId: '-1001234567891' } })).ready, false, 'Partial Telegram source rejected');
assert.equal(result(fixture({ ad: { body: 'A'.repeat(4097) } })).ready, false, 'Oversized text rejected');
assert.equal(result(fixture({ authorized: false })).ready, false, 'Unauthorized destination rejected');
assert.equal(result(fixture({ status: 'paused' })).ready, false, 'Paused campaign rejected');
const worker = fs.readFileSync(workerFile, 'utf8');
assert.match(worker, /data\.kind === 'text'/, 'Worker should support own text');
assert.match(worker, /sendMessage\(to\.entity!, \{ message: data\.body \}\)/, 'Worker sends user text');
assert.match(worker, /NASHRA_PUBLISHING_ENABLED !== '1'/, 'Worker remains opt-in');
assert.match(worker, /nashra_v24_claim_one/, 'Worker retains atomic claim');
assert.match(worker, /never|no automatic retries/i, 'Worker retains no auto retry');
console.log('Nashra: 15 tests de publication V3.6 reussis (aucun envoi Telegram).');
