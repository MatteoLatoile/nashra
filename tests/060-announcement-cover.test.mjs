import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/app/(dashboard)/annonces/page.tsx', import.meta.url), 'utf8');

test('060: first visible announcement with an image is prioritized', () => {
  assert.match(src, /const firstCoverId = initialCoverIds\[0\]/);
  assert.match(src, /loading=\{earlyCoverIds\.has\(a\.id\) \? 'eager' : 'lazy'\}/);
  assert.match(src, /fetchPriority=\{a\.id === firstCoverId \? 'high' : 'auto'\}/);
});

test('060: preserve original photo URLs for previews and Telegram', () => {
  // Les cartes peuvent afficher une miniature en version 061.
  assert.match(src, /thumbnailUrls/);
  // La reference a l'image originale reste disponible.
  assert.match(src, /imageUrls\(a\)\[0\]/);
  assert.match(src, /<img src=\{images\[Math\.min\(imageIndex, images\.length-1\)\]\}/);
  assert.doesNotMatch(src, /\/storage\/v1\/render\/image|[?&]width=480/);
});

test('060: stable image dimensions and asynchronous decoding', () => {
  assert.match(src, /width=\{480\} height=\{270\}/);
  assert.match(src, /decoding="async"/);
});
