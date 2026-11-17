import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const file = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('070: confirmation link requires an explicit user click before OTP consumption', () => {
  const page = file('../src/app/auth/confirm/page.tsx');
  assert.match(page, /type: flow/);
  assert.match(page, /auth\.verifyOtp\(/);
  assert.match(page, /onClick=\{\(\) => void confirm\(\)\}/);
  assert.match(page, /phase !== 'ready'/);
  assert.match(page, /flow === 'recovery' \? '\/reinitialiser' : '\/dashboard'/);
});

test('070: branded email templates link to the explicit confirmation page', () => {
  for (const [template, flow] of [['confirm-signup','email'],['reset-password','recovery']]) {
    const html = file(`../supabase/email-templates/${template}.html`);
    assert.match(html, /\{\{ \.TokenHash \}\}/);
    assert.ok(html.includes(`&amp;type=${flow}`));
    assert.match(html, /nashra/);
    assert.doesNotMatch(html, /https:\/\/[^\s"']*\.supabase\.co/);
  }
});

test('070: reset links and branded pages are connected', () => {
  const form = file('../src/app/connexion/auth-form.tsx');
  const reset = file('../src/app/reinitialiser/page.tsx');
  assert.match(form, /redirectTo: `\$\{window\.location\.origin\}\/reinitialiser`/);
  assert.match(reset, /n70-brand/);
  assert.match(reset, /auth\.updateUser\(\{ password \}\)/);
});
