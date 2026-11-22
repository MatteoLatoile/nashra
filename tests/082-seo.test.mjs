import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
test('082: public homepage has server metadata, canonical and structured data', () => {
 const s=read('src/app/page.tsx');
 assert.match(s,/export const metadata/);
 assert.match(s,/canonical: '\/'/);
 assert.match(s,/SoftwareApplication/);
 assert.match(s,/LandingClient/);
});
test('082: sitemap lists only public pages, no private route', () => {
 const s=read('src/app/sitemap.ts');
 assert.match(s,/usenashra.com\/aide/);
 assert.doesNotMatch(s,/usenashra.com\/dashboard/);
});
test('082: private dashboard and authentication routes are noindex', () => {
 for(const f of ['src/app/(dashboard)/layout.tsx','src/app/connexion/layout.tsx','src/app/bienvenue/layout.tsx','src/app/reinitialiser/layout.tsx']) assert.match(read(f),/index: false/);
});
test('082: multilingual canonical alternates are not invented without localized URLs', () => {
 assert.doesNotMatch(read('src/app/page.tsx'),/hreflang|languages:/);
 assert.match(read('src/app/robots.ts'),/sitemap.xml/);
});
