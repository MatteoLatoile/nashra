'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const { validateAppUrl, externalHttpUrl } = require('../url-policy.cjs');
const projectRoot = path.resolve(__dirname, '..');

test('ouvre le tableau de bord Nashra et préserve les chemins personnalisés', () => {
  assert.equal(validateAppUrl('https://nashra.example.org'), 'https://nashra.example.org/dashboard');
  assert.equal(validateAppUrl('https://nashra.example.org/connexion'), 'https://nashra.example.org/connexion');
});

test('refuse HTTP en production, faux domaine et URL comportant des identifiants', () => {
  for (const input of ['http://nashra.fr', 'https://example.com', 'https://a:b@nashra.com/dashboard', 'javascript:alert(1)', 'https://nashra.fr/?token=x']) {
    assert.throws(() => validateAppUrl(input));
  }
});

test('localhost autorisé seulement en mode développement / test local', () => {
  assert.equal(validateAppUrl('http://localhost:3000/', 'development'), 'http://localhost:3000/dashboard');
  assert.equal(validateAppUrl('http://localhost:3000/dashboard', 'local-test'), 'http://localhost:3000/dashboard');
  assert.throws(() => validateAppUrl('http://localhost:3000/dashboard', 'production'));
});

test('n’ouvre pas les schémas dangereux via navigateur', () => {
  assert.equal(externalHttpUrl('file:///C:/Windows/system.ini'), null);
  assert.equal(externalHttpUrl('javascript:alert(1)'), null);
  assert.equal(externalHttpUrl('https://stripe.com'), 'https://stripe.com/');
});

test('config Windows prévoit un vrai installeur NSIS Program Files', () => {
  const original = JSON.parse(fs.readFileSync(path.join(projectRoot, 'runtime-config.json')));
  const config = require('../builder.config.cjs');
  assert.equal(config.nsis.perMachine, true);
  assert.equal(config.nsis.oneClick, false);
  assert.equal(config.nsis.allowToChangeInstallationDirectory, true);
  assert.equal(config.nsis.createDesktopShortcut, true);
  assert.ok(config.win.target.find(t => t.target === 'nsis'));
  assert.equal(config.asar, true);
  assert.ok(['development', 'production', 'local-test'].includes(original.mode));
});

test('le composant de bureau n’embarque aucun secret Supabase ou Telegram', () => {
  const builder = fs.readFileSync(path.join(projectRoot, 'builder.config.cjs'), 'utf8');
  assert.ok(!builder.includes('.env.local'));
  const src = fs.readFileSync(path.join(projectRoot, 'main.cjs'), 'utf8');
  assert.match(src, /nodeIntegration:\s*false/);
  assert.match(src, /contextIsolation:\s*true/);
  assert.match(src, /sandbox:\s*true/);
  assert.match(src, /setPermissionRequestHandler/);
});

test('le build public refuse de se créer sans adresse de serveur HTTPS', () => {
  const p = spawnSync(process.execPath, ['scripts/prepare-build.cjs'], { cwd: projectRoot, env: { ...process.env, NASHRA_DESKTOP_URL: '' }, encoding: 'utf8' });
  assert.notEqual(p.status, 0);
  assert.match(p.stderr, /HTTPS|manquante|Adresse/);
});
