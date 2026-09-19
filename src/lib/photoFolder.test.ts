import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPhotoExportPlan, sanitizeSegment } from './photoFolder';
import type { Course, PhotoMeta } from '../types';

const courses: Course[] = [
  { id: 'c1', name: '高等数学/上', color: '', slots: [], createdAt: 1 },
  { id: 'c2', name: '英语', color: '', slots: [], createdAt: 2 },
];

function photo(id: string, courseId: string, takenAt: number, extra: Partial<PhotoMeta> = {}): PhotoMeta {
  return {
    id,
    fileName: `${id}-original.jpg`,
    thumbFileName: `${id}-thumb.jpg`,
    cropFileName: `${id}-crop.jpg`,
    mimeType: 'image/jpeg',
    takenAt,
    createdAt: takenAt,
    courseId,
    capture: 'auto',
    note: '',
    ...extra,
  };
}

const T1 = new Date(2026, 8, 18, 8, 5).getTime();

test('sanitizeSegment：清洗文件系统非法字符与结尾点空格', () => {
  assert.equal(sanitizeSegment('高数/上:第一*讲?'), '高数_上_第一_讲_');
  assert.equal(sanitizeSegment('  名字. '), '名字');
  assert.equal(sanitizeSegment(''), '未命名');
});

test('导出计划：按课程分目录、时间命名、original/thumb/crop 三件套', () => {
  const plan = buildPhotoExportPlan([photo('a', 'c1', T1)], courses);
  assert.deepEqual(
    plan.map((e) => e.relPath),
    [
      '高等数学_上/20260918-0805-original.jpg',
      '高等数学_上/20260918-0805-thumb.jpg',
      '高等数学_上/20260918-0805-crop.jpg',
    ],
  );
  assert.equal(plan[0].fileName, 'a-original.jpg');
});

test('导出计划：原图已清理则跳过 original，未归属落入未分类', () => {
  const plan = buildPhotoExportPlan(
    [photo('a', 'c2', T1, { originalRemoved: true }), photo('b', '', T1)],
    courses,
  );
  assert.equal(plan.some((e) => e.fileName === 'a-original.jpg'), false); // a 已清理原图，不入计划
  assert.equal(plan.some((e) => e.fileName === 'b-original.jpg'), true); // b 原图正常
  assert.equal(plan.filter((e) => e.relPath.startsWith('未分类/')).length, 3); // b 三件套都在未分类
});

test('导出计划：同课程同时间多张自动加序号防覆盖', () => {
  const plan = buildPhotoExportPlan(
    [photo('a', 'c2', T1), photo('b', 'c2', T1)],
    courses,
  );
  const originals = plan.filter((e) => e.relPath.includes('original')).map((e) => e.relPath);
  assert.equal(new Set(originals).size, originals.length);
  assert.ok(originals.some((r) => r.includes('-original-2.jpg')));
});
