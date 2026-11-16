import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const path = 'src/app/(dashboard)/annonces/page.tsx';
const source = fs.readFileSync(path, 'utf8');
test('image uploader is dynamically imported only when editor is needed', () => {
  assert.match(source, /dynamic\(\s*\(\) => import\('@\/components\/announcement-image-upload'\)/);
  assert.doesNotMatch(source, /import\s*\{\s*AnnouncementImageUpload\s*\}\s*from/);
  assert.match(source, /\{editor && <Modal/);
});
test('search index builds only when announcements change', () => {
  assert.match(source, /const searchIndex = useMemo\(/);
  assert.match(source, /\}\)\), \[data\.announcements\]\);/);
  assert.match(source, /\[searchIndex, filter, origin, normalizedQuery, sort\]/);
});
test('pagination, publication safety and visuals remain intact', () => {
  assert.match(source, /const \[visibleCount, setVisibleCount\] = useState\(24\)/);
  assert.match(source, /publish-announcement/);
  assert.match(source, /crypto\.randomUUID\(\)/);
  assert.match(source, /n12-grid/);
  assert.match(source, /n12-card/);
});
