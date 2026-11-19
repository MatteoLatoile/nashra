import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
test('076 separate owned MP4 bucket and bounded upload', () => {
 const sql=source('supabase/030_video_upload_076.sql');
 assert.match(sql,/nashra-announcement-videos/);
 assert.match(sql,/auth.uid\(\)/);
 assert.match(sql,/20971520/);
});
test('076 no remote URL fetching and MP4 signature verification', () => {
 const src=source('src/lib/automation/photos.ts');
 assert.match(src,/url.origin !== base.origin/);
 assert.match(src,/isMp4/);
 assert.match(src,/ownerUserId/);
});
test('076 both live and native Telegram sends include video', () => {
 assert.match(source('src/lib/automation/worker.ts'),/data.kind === 'video'/);
 assert.match(source('src/lib/automation/telegram-native.ts'),/work.kind === 'video'/);
 assert.match(source('src/app/api/automation/native-schedule/route.ts'),/loadVideo/);
 assert.match(source('src/lib/automation/recurring-service.ts'),/loadVideo/);
});
test('076 video cannot be mixed with photos', () => {
 assert.match(source('src/lib/automation/worker.ts'),/hasImages && ad.videoUrl/);
 assert.match(source('src/lib/automation/readiness.ts'),/hasVideo && hasImages/);
});
