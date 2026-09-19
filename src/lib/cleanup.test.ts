import test from 'node:test';
import assert from 'node:assert/strict';
import { courseCleanupPlan, findOrphans, progressKeys, referencedFiles } from './cleanup';
import type { PhotoMeta } from '../types';

function photo(id: string, courseId: string, files: string[]): PhotoMeta {
  return {
    id,
    fileName: files[0],
    thumbFileName: files[1],
    cropFileName: files[2],
    mimeType: 'image/jpeg',
    takenAt: 0,
    createdAt: 0,
    courseId,
    capture: 'auto',
    note: '',
  };
}

test('referencedFiles：跳过缺失字段', () => {
  const p = photo('a', 'c1', ['a-original.jpg', undefined, 'a-crop.jpg'] as string[]);
  assert.deepEqual(referencedFiles(p), ['a-original.jpg', 'a-crop.jpg']);
});

test('findOrphans：三个字段都被引用保护，多余文件是孤儿', () => {
  const photos = [
    photo('a', 'c1', ['a-original.jpg', 'a-thumb.jpg', 'a-crop.jpg']),
    photo('b', 'c1', ['b-original.jpg', 'b-thumb.jpg', 'b-thumb.jpg']),
  ];
  const orphans = findOrphans(
    ['a-original.jpg', 'a-thumb.jpg', 'a-crop.jpg', 'b-original.jpg', 'b-thumb.jpg', 'orphan.bin', 'old.jpg'],
    photos,
  );
  assert.deepEqual(orphans, ['orphan.bin', 'old.jpg']);
});

test('findOrphans：无记录时全部是孤儿', () => {
  assert.deepEqual(findOrphans(['x.jpg', 'y.jpg'], []), ['x.jpg', 'y.jpg']);
});

test('courseCleanupPlan：按课程过滤', () => {
  const photos = [photo('a', 'c1', ['a.jpg']), photo('b', 'c2', ['b.jpg']), photo('c', 'c1', ['c.jpg'])];
  assert.deepEqual(courseCleanupPlan('c1', photos).map((p) => p.id), ['a', 'c']);
  assert.equal(courseCleanupPlan('c9', photos).length, 0);
});

test('progressKeys：只匹配本应用的进度键', () => {
  assert.deepEqual(progressKeys(['classlist:lastview:c1', 'theme', 'classlistx']), ['classlist:lastview:c1']);
});
