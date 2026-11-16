import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const page = readFileSync('src/app/(dashboard)/annonces/page.tsx', 'utf8');
const uploader = readFileSync('src/components/announcement-image-upload.tsx', 'utf8');
const thumb = readFileSync('src/lib/images/client-thumbnail.ts', 'utf8');
const store = readFileSync('src/lib/store.tsx', 'utf8');
test('Conserve les images originales pour Telegram', () => {
  assert.match(page, /imageUrls: urls, thumbnailUrls:/);
  assert.match(page, /publish-announcement/);
  assert.match(store, /imageUrls\?: string\[\]/);
});
test('Crée des miniatures WebP localement et seulement si plus légères', () => {
  assert.match(thumb, /canvas\.toBlob\(resolve, 'image\/webp', 0\.72\)/);
  assert.match(thumb, /thumbnail\.size < file\.size/);
  assert.match(thumb, /36_000_000/);
});
test('Les échecs de miniatures ne bloquent pas l’original', () => {
  assert.match(uploader, /uploaded\.push\(publicData\.publicUrl\)/);
  assert.match(uploader, /catch \{ \/\* Original image remains usable/);
});
test('Les cartes affichent la miniature et reviennent à l’original en cas d’erreur', () => {
  assert.match(page, /a\.thumbnailUrls\?\.\[imageUrls\(a\)\[0\]\] \|\| imageUrls\(a\)\[0\]/);
  assert.match(page, /onError=\{event =>/);
});
test('Priorité limitée à la première carte, les suivantes restent lazy', () => {
  assert.match(page, /loading=\{a\.id === firstCoverId \? 'eager' : 'lazy'\}/);
});
test('Anciennes annonces optimisées à la demande, par petits lots', () => {
  assert.match(page, /legacyCovers\.slice\(0, 5\)/);
  assert.match(page, /onClick=\{\(\) => void optimizeExistingCovers\(\)\}/);
  assert.doesNotMatch(page, /useEffect\(\(\) => \{\s*void optimizeExistingCovers/);
});
test('La métadonnée des miniatures accompagne copie et modification', () => {
  assert.match(store, /thumbnailUrls\?: Record<string, string>/);
  assert.match(page, /thumbnailUrls: a\.thumbnailUrls \|\| \{\}/);
  assert.match(page, /Object\.fromEntries\(urls\.filter\(url => editor\.thumbnails\[url\]\)/);
});
test('Aucun appel à Telegram ou Stripe ajouté dans le générateur', () => {
  assert.doesNotMatch(thumb, /fetch\(|telegram|stripe|supabase/i);
});
