import type { Course, PhotoMeta } from '../types';

const TOLERANCE_MIN = 10;

export interface MatchResult {
  courseId: string;
  /** 拍摄点落在课程时间槽内的分钟数（含容差边缘按 0 计），用于重叠时择优 */
  score: number;
}

/**
 * 拍摄时间 × 课表匹配：星期必须一致；时间落在 [start-容差, end+容差] 内才算命中；
 * 多门课重叠时取"覆盖最深"的课程（如 10:05 同时命中 8:00-10:10 和 10:00-11:40，归后者）。
 */
export function matchCourse(photo: Pick<PhotoMeta, 'takenAt'>, courses: Course[]): MatchResult | null {
  if (photo.takenAt == null) return null;
  const d = new Date(photo.takenAt);
  const weekday = d.getDay();
  const min = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
  let best: MatchResult | null = null;
  for (const c of courses) {
    for (const s of c.slots) {
      if (s.weekday !== weekday) continue;
      if (min < s.startMin - TOLERANCE_MIN || min > s.endMin + TOLERANCE_MIN) continue;
      const score = Math.min(min, s.endMin) - Math.max(min, s.startMin);
      if (!best || score > best.score) best = { courseId: c.id, score };
    }
  }
  return best;
}
