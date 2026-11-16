import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../src/app/(dashboard)/annonces/page.tsx', import.meta.url), 'utf8');

test('062: three initial cover images load eagerly, others stay lazy', () => {
  assert.match(page, /visibleAnnouncements\s*\.filter\(a => imageUrls\(a\)\.length > 0\)\s*\.slice\(0, 3\)/);
  assert.match(page, /loading=\{earlyCoverIds\.has\(a\.id\) \? 'eager' : 'lazy'\}/);
});
test('062: only first cover gets high priority, avoiding network contention', () => {
  assert.match(page, /const firstCoverId = initialCoverIds\[0\]/);
  assert.match(page, /fetchPriority=\{a\.id === firstCoverId \? 'high' : 'auto'\}/);
});
test('062: original Telegram photos and thumbnails are not replaced', () => {
  assert.match(page, /a\.thumbnailUrls\?\.\[imageUrls\(a\)\[0\]\] \|\| imageUrls\(a\)\[0\]/);
  assert.match(page, /publish-announcement/);
  assert.match(page, /<img src=\{images\[Math\.min\(imageIndex, images\.length-1\)\]\}/);
});
