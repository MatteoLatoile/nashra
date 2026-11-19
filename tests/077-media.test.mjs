import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const s = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
test('077 compresse les images en local avec une limite de taille et de pixels', () => {
  const src=s('src/lib/images/client-optimize.ts');
  assert.match(src, /MAX_PHOTO_SOURCE_BYTES/);
  assert.match(src, /MAX_PHOTO_UPLOAD_BYTES/);
  assert.match(src, /MAX_PIXELS/);
  assert.match(src, /createImageBitmap\(file\)/);
  assert.match(s('src/components/announcement-image-upload.tsx'), /await optimizeImage\(original\)/);
  assert.match(s('src/components/announcement-image-upload.tsx'), /makeThumbnail\(file\)/);
});
test('077 FFmpeg est uniquement chargÃ© depuis le navigateur sur les fichiers lourds', () => {
  const core=s('src/lib/images/client-video.ts');
  assert.match(core, /script\.src\s*=\s*'\/vendor\/ffmpeg\/ffmpeg\.js'/);
  assert.match(core, /import\('@ffmpeg\/util'\)/);
  assert.match(core, /cdn\.jsdelivr\.net\/npm\/@ffmpeg\/core/);
  assert.match(core, /ffmpeg\.terminate\(\)/);
  const ui=s('src/components/announcement-video-upload.tsx');
  assert.match(ui, /file\.size > 10 \* 1024 \* 1024/);
  assert.match(ui, /MAX_VIDEO_UPLOAD_BYTES/);
  assert.match(ui, /inspectVideo\(file\)/);
  assert.match(ui, /posterKey/);
  assert.match(ui, /onChange\(videoUrl, poster\)/);
});
test('077 les listes affichent les miniatures et jamais un lecteur MP4 par carte', () => {
  const page=s('src/app/(dashboard)/annonces/page.tsx');
  assert.match(page, /a\.videoThumbnailUrl \? <img/);
  assert.doesNotMatch(page, /<video src=\{a\.videoUrl\} muted/);
  assert.match(page, /poster=\{preview\.videoThumbnailUrl \|\| undefined\}/);
  assert.match(s('src/lib/store.tsx'), /videoThumbnailUrl\?: string/);
});
test('077 les vidÃ©os sont contrÃ´lÃ©es avant effets Telegram', () => {
  const worker=s('src/lib/automation/worker.ts');
  const photos=s('src/lib/automation/photos.ts');
  assert.match(worker, /mp4DurationSeconds\(buffer\)/);
  assert.match(worker, /duration > 90/);
  assert.match(photos, /export function mp4DurationSeconds/);
  assert.match(worker, /loadVideo\(db, work.video\)/);
  assert.match(s('src/app/api/telegram/user/publish-announcement/route.ts'), /loadVideo/);
  assert.match(s('src/lib/automation/telegram-native.ts'), /work.kind === 'video'/);
});

