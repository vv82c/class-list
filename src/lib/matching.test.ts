import test from 'node:test';
import assert from 'node:assert/strict';
import { describeWeeks, matchCourse, teachingWeek, weekMatches } from './matching';
import type { Course, WeeksSpec } from '../types';

const at = (weekday: number, h: number, m: number) => {
  const d = new Date(2026, 8, 14 + ((weekday + 6) % 7)); // 2026-08-16 是周日，+((weekday+6)%7) 得到对应星期
  d.setHours(h, m, 0, 0);
  return d.getTime();
};

/** 2026 年秋季学期（首周周一 2026-08-31）里的某天某刻 */
const onDate = (month: number, day: number, h: number, m: number) =>
  new Date(2026, month - 1, day, h, m, 0, 0).getTime();

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

// —— 教学周与单双周 ——

const ODD: WeeksSpec = { from: 1, to: 25, step: 2 };
const EVEN: WeeksSpec = { from: 2, to: 25, step: 2 };
const FIRST8: WeeksSpec = { from: 1, to: 8, step: 1 };
const SEMESTER_START = '2026-08-31'; // 周一

test('teachingWeek：首周内任一天都是第1周（含周日的收尾）', () => {
  assert.equal(teachingWeek(onDate(8, 31, 12, 0), SEMESTER_START), 1);
  assert.equal(teachingWeek(onDate(9, 2, 8, 0), SEMESTER_START), 1);
  assert.equal(teachingWeek(onDate(9, 6, 20, 0), SEMESTER_START), 1);
});

test('teachingWeek：周一周界翻到第2周', () => {
  assert.equal(teachingWeek(onDate(9, 7, 0, 0), SEMESTER_START), 2);
});

test('teachingWeek：学期开始前的日期是第0周', () => {
  assert.equal(teachingWeek(onDate(8, 28, 12, 0), SEMESTER_START), 0);
});

test('weekMatches：每周槽设了学期起点后，第0周不命中', () => {
  assert.equal(weekMatches(null, undefined), true);
  assert.equal(weekMatches(5, undefined), true);
  assert.equal(weekMatches(0, undefined), false);
});

test('weekMatches：单双周与范围', () => {
  assert.equal(weekMatches(3, ODD), true);
  assert.equal(weekMatches(4, ODD), false);
  assert.equal(weekMatches(4, EVEN), true);
  assert.equal(weekMatches(8, FIRST8), true);
  assert.equal(weekMatches(9, FIRST8), false);
  assert.equal(weekMatches(null, ODD), false); // 没有学期起点时隔周课宁可不归
});

test('describeWeeks：预设的显示名', () => {
  assert.equal(describeWeeks(undefined), '每周');
  assert.equal(describeWeeks(ODD), '单周');
  assert.equal(describeWeeks(EVEN), '双周');
  assert.equal(describeWeeks(FIRST8), '第1-8周');
  assert.equal(describeWeeks({ from: 3, to: 17, step: 2 }), '第3-17周隔周');
});

test('单双周互斥共用时段：按教学周各归各课', () => {
  // 现实场景：单周课与双周课轮流使用周五 8:00-9:40 同一时段
  const oddCourse: Course = { id: 'odd', name: '单周课', color: '', slots: [{ weekday: 5, startMin: 480, endMin: 580, weeks: ODD }], createdAt: 0 };
  const evenCourse: Course = { id: 'even', name: '双周课', color: '', slots: [{ weekday: 5, startMin: 480, endMin: 580, weeks: EVEN }], createdAt: 0 };
  const both = [oddCourse, evenCourse];
  // 2026-09-18 是第3周（单周）→ 单周课；2026-09-11 是第2周（双周）→ 双周课
  assert.equal(matchCourse({ takenAt: onDate(9, 18, 8, 30) }, both, SEMESTER_START)?.courseId, 'odd');
  assert.equal(matchCourse({ takenAt: onDate(9, 11, 8, 30) }, both, SEMESTER_START)?.courseId, 'even');
  // 只录了双周课时，单周拍的照片不命中（去未分类）
  assert.equal(matchCourse({ takenAt: onDate(9, 18, 8, 30) }, [evenCourse], SEMESTER_START), null);
});

test('设置了学期起点后，开学前的照片不自动归课', () => {
  // 2026-08-24 是周一，但在第0周
  assert.equal(matchCourse({ takenAt: onDate(8, 24, 8, 30) }, [math], SEMESTER_START), null);
  // 未设学期起点时维持旧行为
  assert.equal(matchCourse({ takenAt: onDate(8, 24, 8, 30) }, [math])?.courseId, 'math');
});
