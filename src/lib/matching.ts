import type { Course, PhotoMeta, WeeksSpec } from '../types';

const TOLERANCE_MIN = 10;
const DAY_MS = 86400000;

export interface MatchResult {
  courseId: string;
  /** 拍摄点落在课程时间槽内的分钟数（含容差边缘按 0 计），用于重叠时择优 */
  score: number;
}

/** 取时间戳所在周的周一 00:00（本地时区） */
function weekStartMs(ms: number): number {
  const d = new Date(ms);
  const offset = ((d.getDay() + 6) % 7) * DAY_MS; // 周一=0
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - offset;
}

/**
 * 日期所在的教学周序号（学期首周 = 1，可为之 前 0 / 负）。
 * semesterStart 为 'YYYY-MM-DD'，学期第一周内的任一天（按所在周的周一对齐）。
 */
export function teachingWeek(dateMs: number, semesterStart: string): number {
  const start = new Date(`${semesterStart}T00:00:00`);
  return Math.floor((weekStartMs(dateMs) - weekStartMs(start.getTime())) / (7 * DAY_MS)) + 1;
}

/** 该教学周是否落在时间槽的周次范围内。weekIndex = null 表示未设学期起点（按每周处理） */
export function weekMatches(weekIndex: number | null, weeks?: WeeksSpec): boolean {
  if (!weeks) return weekIndex == null || weekIndex >= 1;
  if (weekIndex == null) return false; // 隔周/范围课程没有学期起点无法判定，宁可不归
  return weekIndex >= weeks.from && weekIndex <= weeks.to && (weekIndex - weeks.from) % weeks.step === 0;
}

/** 周次的人话描述（用于课表格子、时间线标题） */
export function describeWeeks(weeks?: WeeksSpec): string {
  if (!weeks) return '每周';
  if (weeks.step === 2) {
    // 只有覆盖整学期的隔周槽才叫单/双周，否则显示具体范围
    const spansSemester = weeks.to >= weeks.from + 20;
    if (spansSemester && weeks.from % 2 === 1) return '单周';
    if (spansSemester && weeks.from % 2 === 0) return '双周';
    return `第${weeks.from}-${weeks.to}周隔周`;
  }
  return `第${weeks.from}-${weeks.to}周`;
}

/** 课表格子用的极短描述：单 / 双 / 1-8周；每周返回空串 */
export function describeWeeksShort(weeks?: WeeksSpec): string {
  if (!weeks) return '';
  if (weeks.step === 2 && weeks.from % 2 === 1) return '单';
  if (weeks.step === 2 && weeks.from % 2 === 0) return '双';
  return `${weeks.from}-${weeks.to}周`;
}

/**
 * 拍摄时间 × 课表匹配：星期一致 + 时间窗（±容差）+ 教学周次过滤。
 * 多门课重叠时取"覆盖最深"的课程。semesterStart 缺省时不做周次过滤（兼容旧数据）。
 */
export function matchCourse(
  photo: Pick<PhotoMeta, 'takenAt'>,
  courses: Course[],
  semesterStart?: string | null,
): MatchResult | null {
  if (photo.takenAt == null) return null;
  const d = new Date(photo.takenAt);
  const weekday = d.getDay();
  const min = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
  const weekIndex = semesterStart ? teachingWeek(photo.takenAt, semesterStart) : null;
  let best: MatchResult | null = null;
  for (const c of courses) {
    for (const s of c.slots) {
      if (s.weekday !== weekday) continue;
      if (!weekMatches(weekIndex, s.weeks)) continue;
      if (min < s.startMin - TOLERANCE_MIN || min > s.endMin + TOLERANCE_MIN) continue;
      const score = Math.min(min, s.endMin) - Math.max(min, s.startMin);
      if (!best || score > best.score) best = { courseId: c.id, score };
    }
  }
  return best;
}
