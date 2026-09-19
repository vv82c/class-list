import { describeWeeks, weekMatches } from './matching';
import { slotToString, WEEKDAY_NAMES, type Course, type PhotoMeta, type ScheduleSlot } from '../types';

const DAY_MS = 86400000;
const MAX_WEEKS = 60; // 教学周上限（约一学期），编号推导只扫这个范围

export interface SessionGroup {
  key: string;
  /** 如 "第3堂 · 2026-09-18 周五 08:00-09:40 · 单周"；无学期配置时不含堂数与周次 */
  title: string;
  /** 第几堂（按学期时间槽顺序推导）；补课/未设学期起点时为 null */
  number: number | null;
  count: number;
  photos: PhotoMeta[];
}

const dayKey = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** 学期首周的周一 00:00 */
function semesterMondayMs(semesterStart: string): number {
  const start = new Date(`${semesterStart}T00:00:00`);
  return start.getTime() - ((start.getDay() + 6) % 7) * DAY_MS;
}

/** 课程在本学期的每一次课（跨时间槽合并、按时间升序、从 1 连续编号） */
function courseOccurrences(course: Course, semesterStart: string) {
  const monday0 = semesterMondayMs(semesterStart);
  const out: { dayKey: string; slotStartMin: number; at: number; number: number }[] = [];
  for (const slot of course.slots) {
    for (let w = 1; w <= MAX_WEEKS; w++) {
      if (!weekMatches(w, slot.weeks)) continue;
      const date = new Date(monday0 + (w - 1) * 7 * DAY_MS);
      date.setDate(date.getDate() + ((slot.weekday + 6) % 7));
      date.setHours(Math.floor(slot.startMin / 60), slot.startMin % 60, 0, 0);
      out.push({ dayKey: dayKey(date.getTime()), slotStartMin: slot.startMin, at: date.getTime(), number: 0 });
    }
  }
  out.sort((a, b) => a.at - b.at);
  out.forEach((o, i) => (o.number = i + 1));
  return out;
}

function slotMatchesAt(slot: ScheduleSlot, at: number): boolean {
  const d = new Date(at);
  return (
    slot.weekday === d.getDay() &&
    at >= new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, slot.startMin - 10).getTime() &&
    at <= new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, slot.endMin + 10).getTime()
  );
}

export interface PendingGroup {
  courseId: string;
  photos: PhotoMeta[];
}

/** 待确认照片按课程分组（组按张数降序），供归档页"待确认"分课程核对 */
export function groupPendingByCourse(photos: PhotoMeta[]): PendingGroup[] {
  const map = new Map<string, PhotoMeta[]>();
  for (const p of photos) {
    const key = p.courseId || '';
    const list = map.get(key) ?? [];
    list.push(p);
    map.set(key, list);
  }
  return [...map.entries()]
    .map(([courseId, ps]) => ({ courseId, photos: ps }))
    .sort((a, b) => b.photos.length - a.photos.length || (a.courseId === '') - (b.courseId === '') || a.courseId.localeCompare(b.courseId));
}

/**
 * 单张照片的「第几堂」；照片不在课程、无学期配置或不排课时返回 null。
 * （与 groupSessions 的堂数口径一致）
 */
export function sessionNumberFor(
  photo: PhotoMeta,
  course: Course | undefined,
  semesterStart?: string | null,
): number | null {
  if (!course || !semesterStart || photo.takenAt == null) return null;
  const slot = course.slots.find((s) => slotMatchesAt(s, photo.takenAt!));
  if (!slot) return null;
  const target = dayKey(photo.takenAt);
  for (const o of courseOccurrences(course, semesterStart)) {
    if (o.dayKey === target && o.slotStartMin === slot.startMin) return o.number;
  }
  return null;
}

/**
 * 把照片按"哪一节课"分组：优先用拍摄时间命中的课程时间槽（含日期），
 * 命不中则退化为按拍摄日期分组。semesterStart 提供时推导"第几堂"
 * （按学期时间槽顺序跨槽连续编号；补课等不在课表上的日期不编号）。
 */
export function groupSessions(
  photos: PhotoMeta[],
  courses: Course[],
  semesterStart?: string | null,
): SessionGroup[] {
  // 堂数索引：courseId|日期|槽开始分钟 → 第几堂
  const numbers = new Map<string, number>();
  if (semesterStart) {
    for (const course of courses) {
      for (const o of courseOccurrences(course, semesterStart)) {
        numbers.set(`${course.id}|${o.dayKey}|${o.slotStartMin}`, o.number);
      }
    }
  }

  const buckets = new Map<string, { title: string; number: number | null; photos: PhotoMeta[]; sortAt: number }>();
  for (const photo of photos) {
    const at = photo.takenAt ?? photo.createdAt;
    const d = new Date(at);
    const day = dayKey(at);
    const course = photo.courseId ? courses.find((c) => c.id === photo.courseId) : undefined;
    const slot = course?.slots.find((s) => slotMatchesAt(s, at));

    const number = course && slot ? (numbers.get(`${course.id}|${day}|${slot.startMin}`) ?? null) : null;
    const key = slot && course ? `${course.id}|${day}|${slot.startMin}` : `day|${day}`;
    const weekSuffix = slot?.weeks ? ` · ${describeWeeks(slot.weeks)}` : '';
    const title =
      slot && course
        ? `${number ? `第${number}堂 · ` : ''}${day} ${WEEKDAY_NAMES[slot.weekday]} ${slotToString(slot.startMin)}-${slotToString(slot.endMin)}${weekSuffix}`
        : `${day} ${WEEKDAY_NAMES[d.getDay()]}`;

    const bucket = buckets.get(key) ?? { title, number, photos: [], sortAt: at };
    bucket.photos.push(photo);
    bucket.sortAt = Math.min(bucket.sortAt, at);
    buckets.set(key, bucket);
  }

  return [...buckets.entries()]
    .sort((a, b) => b[1].sortAt - a[1].sortAt)
    .map(([key, v]) => ({ key, title: v.title, number: v.number, count: v.photos.length, photos: v.photos }));
}
