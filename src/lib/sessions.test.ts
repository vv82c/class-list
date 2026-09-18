import test from 'node:test';
import assert from 'node:assert/strict';
import { groupSessions } from './sessions';
import type { Course, PhotoMeta } from '../types';

const SEMESTER_START = '2026-08-31'; // 周一，第1周 = 08-31 ~ 09-06

// 高数：周三 10:00-11:40（每周）+ 周五 08:00-09:40（单周）
const math: Course = {
  id: 'math',
  name: '高数',
  color: '#0ea5e9',
  slots: [
    { weekday: 3, startMin: 600, endMin: 700 },
    { weekday: 5, startMin: 480, endMin: 580, weeks: { from: 1, to: 25, step: 2 } },
  ],
  createdAt: 0,
};

const onDate = (month: number, day: number, h: number, m: number) =>
  new Date(2026, month - 1, day, h, m, 0, 0).getTime();

function photo(id: string, takenAt: number): PhotoMeta {
  return {
    id,
    fileName: `${id}.jpg`,
    mimeType: 'image/jpeg',
    takenAt,
    createdAt: takenAt + 60000,
    courseId: 'math',
    capture: 'auto',
    note: '',
  };
}

const photos = [
  photo('p-wed-w1', onDate(9, 2, 10, 20)), // 第1堂（周三·每周）
  photo('p-fri-w1', onDate(9, 4, 8, 30)), // 第2堂（周五·单周）
  photo('p-wed-w2', onDate(9, 9, 10, 5)), // 第3堂
  photo('p-wed-w3', onDate(9, 16, 10, 50)), // 第4堂
  photo('p-fri-w3', onDate(9, 18, 8, 10)), // 第5堂
  // 09-11 是第2周周五：单周课没排课（补课场景），手动归进来的照片不编号
  photo('p-fri-w2', onDate(9, 11, 8, 20)),
];

const groups = groupSessions(photos, [math], SEMESTER_START);
const byKey = (frag: string) => groups.find((g) => g.title.includes(frag));

test('跨槽连续编号：周三每周课与周五单周课合并排序', () => {
  assert.equal(byKey('09-02')?.number, 1);
  assert.equal(byKey('09-04')?.number, 2);
  assert.equal(byKey('09-09')?.number, 3);
  assert.equal(byKey('09-16')?.number, 4);
  assert.equal(byKey('09-18')?.number, 5);
});

test('单周槽在双周没排课：补课日期不编号，但保留周次描述', () => {
  const g = byKey('09-11');
  assert.equal(g?.number, null);
  assert.ok(g?.title.includes('单周'));
});

test('标题带堂数、日期与周次描述', () => {
  const g = byKey('09-18');
  assert.ok(g?.title.includes('第5堂'));
  assert.ok(g?.title.includes('周五 08:00-09:40'));
  assert.ok(g?.title.includes('单周'));
});

test('未设学期起点：退化为纯日期分组，不编号', () => {
  const groups2 = groupSessions(photos, [math]);
  assert.ok(groups2.every((g) => g.number === null));
  assert.ok(groups2.every((g) => !g.title.includes('堂')));
});

test('组排序：最新课堂在前', () => {
  assert.equal(groups[0].title.includes('09-18'), true);
});
