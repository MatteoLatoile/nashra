'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { validateAppUrl } = require('../url-policy.cjs');
const outputFile = path.join(__dirname, '..', 'runtime-config.json');
const localTest = process.argv.includes('--local-test');
const mode = localTest ? 'local-test' : 'production';
const input = localTest ? 'http://localhost:3000/dashboard' : process.env.NASHRA_DESKTOP_URL;

try {
  const url = validateAppUrl(input, mode);
  fs.writeFileSync(outputFile, JSON.stringify({ url, mode }, null, 2) + '\n', { encoding: 'utf8' });
  console.log(`Nashra Desktop : configuration ${mode} prête (${url}).`);
  if (localTest) {
    console.log('ATTENTION : cet installateur est uniquement destiné au test local avec Next.js démarré.');
  }
} catch (error) {
  console.error(`Échec de préparation : ${error.message}`);
  process.exitCode = 1;
}
