import { slotToString, WEEKDAY_NAMES, type Course, type PhotoMeta } from '../types';

export interface SessionGroup {
  key: string;
  /** 如 "2026-09-18 周三 08:00-09:40"，无课表匹配时为日期 */
  title: string;
  count: number;
  photos: PhotoMeta[];
}

const dayKey = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * 把照片按"哪一节课"分组：优先用拍摄时间命中的课程时间槽（含日期），
 * 命不中则退化为按拍摄日期分组，无 EXIF 时按入库日期。
 */
export function groupSessions(photos: PhotoMeta[], courses: Course[]): SessionGroup[] {
  const buckets = new Map<string, { title: string; photos: PhotoMeta[]; sortAt: number }>();

  for (const photo of photos) {
    const at = photo.takenAt ?? photo.createdAt;
    const d = new Date(at);
    const day = dayKey(at);
    const course = photo.courseId ? courses.find((c) => c.id === photo.courseId) : undefined;
    const slot = course?.slots.find(
      (s) =>
        s.weekday === d.getDay() &&
        at >= new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, s.startMin - 10).getTime() &&
        at <= new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, s.endMin + 10).getTime(),
    );

    const key = slot && course ? `${course.id}|${day}|${slot.startMin}` : `day|${day}`;
    const title = slot
      ? `${day} ${WEEKDAY_NAMES[slot.weekday]} ${slotToString(slot.startMin)}-${slotToString(slot.endMin)}`
      : `${day} ${WEEKDAY_NAMES[d.getDay()]}`;

    const bucket = buckets.get(key) ?? { title, photos: [], sortAt: at };
    bucket.photos.push(photo);
    bucket.sortAt = Math.min(bucket.sortAt, at);
    buckets.set(key, bucket);
  }

  return [...buckets.entries()]
    .sort((a, b) => b[1].sortAt - a[1].sortAt)
    .map(([key, v]) => ({ key, title: v.title, count: v.photos.length, photos: v.photos }));
}
