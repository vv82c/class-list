import test from 'node:test';
import assert from 'node:assert/strict';
import { matchCourse } from './matching';
import type { Course } from '../types';

const at = (weekday: number, h: number, m: number) => {
  const d = new Date(2026, 8, 14 + ((weekday + 6) % 7)); // 2026-08-16 是周日，+((weekday+6)%7) 得到对应星期
  d.setHours(h, m, 0, 0);
  return d.getTime();
};

const math: Course = { id: 'math', name: '高数', color: '', slots: [{ weekday: 1, startMin: 480, endMin: 580 }], createdAt: 0 };
const english: Course = { id: 'eng', name: '英语', color: '', slots: [{ weekday: 1, startMin: 570, endMin: 660 }], createdAt: 0 };
const courses = [math, english];

test('槽内命中', () => assert.equal(matchCourse({ takenAt: at(1, 8, 30) }, courses)?.courseId, 'math'));
test('课前容差命中', () => assert.equal(matchCourse({ takenAt: at(1, 7, 55) }, courses)?.courseId, 'math'));
test('课前超容差不命中', () => assert.equal(matchCourse({ takenAt: at(1, 7, 40) }, courses), null));
test('课后容差边缘命中（下一课已开始则归下一课）', () => assert.equal(matchCourse({ takenAt: at(1, 9, 55) }, courses)?.courseId, 'eng'));
test('仅靠课后容差也能命中', () => assert.equal(matchCourse({ takenAt: at(1, 9, 45) }, [math])?.courseId, 'math'));
test('课后超容差落入下一课', () => assert.equal(matchCourse({ takenAt: at(1, 10, 20) }, courses)?.courseId, 'eng'));
test('重叠时段取覆盖最深', () => assert.equal(matchCourse({ takenAt: at(1, 9, 45) }, courses)?.courseId, 'eng'));
test('星期不符不命中', () => assert.equal(matchCourse({ takenAt: at(2, 8, 30) }, courses), null));
test('无 EXIF 不命中', () => assert.equal(matchCourse({ takenAt: null }, courses), null));
