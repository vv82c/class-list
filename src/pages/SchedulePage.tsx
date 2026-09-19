import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getCourses, getSettings, saveSettings } from '../storage/db';
import { describeWeeksShort, teachingWeek } from '../lib/matching';
import { slotToString, WEEKDAY_NAMES, type Course, type ScheduleSlot } from '../types';

const DAY_START = 8 * 60; // 08:00
const DAY_END = 22 * 60; // 22:00
const PX_PER_MIN = 0.8;
const WEEKDAYS = [1, 2, 3, 4, 5];

type SlotWithCourse = ScheduleSlot & { course: Course };

interface PlacedBlock {
  slot: SlotWithCourse;
  left: number; // 列起始百分比 0-1
  width: number; // 占列宽百分比 0-1
}

/** 同一星期内重叠的时间槽并排切分列宽 */
function layoutDay(slots: SlotWithCourse[]): PlacedBlock[] {
  const sorted = [...slots].sort((a, b) => a.startMin - b.startMin);
  const result: PlacedBlock[] = [];
  let cluster: SlotWithCourse[] = [];
  let clusterEnd = -1;
  const flush = () => {
    if (!cluster.length) return;
    const colEnds: number[] = [];
    const cols = cluster.map((s) => {
      let col = colEnds.findIndex((end) => end <= s.startMin);
      if (col < 0) col = colEnds.length;
      colEnds[col] = s.endMin;
      return col;
    });
    cluster.forEach((slot, i) => {
      result.push({ slot, left: cols[i] / colEnds.length, width: 1 / colEnds.length });
    });
    cluster = [];
    clusterEnd = -1;
  };
  for (const s of sorted) {
    if (cluster.length && s.startMin >= clusterEnd) flush();
    cluster.push(s);
    clusterEnd = Math.max(clusterEnd, s.endMin);
  }
  flush();
  return result;
}

function WeekView({ courses }: { courses: Course[] }) {
  const byDay = WEEKDAYS.map((d) =>
    courses.flatMap((c) => c.slots.filter((s) => s.weekday === d).map((s) => ({ ...s, course: c }))),
  );
  const hours = Array.from({ length: (DAY_END - DAY_START) / 60 + 1 }, (_, i) => DAY_START + i * 60);

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <div className="min-w-[480px]">
        <div className="flex border-b border-slate-200 text-center text-xs text-slate-500">
          <div className="w-10 shrink-0" />
          {WEEKDAYS.map((d) => (
            <div key={d} className="flex-1 py-2 font-medium">
              {WEEKDAY_NAMES[d]}
            </div>
          ))}
        </div>
        <div className="flex">
          <div className="w-10 shrink-0">
            {hours.map((h) => (
              <div
                key={h}
                className="relative text-right text-[10px] text-slate-400"
                style={{ height: 60 * PX_PER_MIN }}
              >
                <span className="absolute -top-1.5 right-1">{slotToString(h)}</span>
              </div>
            ))}
          </div>
          {WEEKDAYS.map((d, di) => (
            <div
              key={d}
              className="relative flex-1 border-l border-slate-100"
              style={{ height: (DAY_END - DAY_START) * PX_PER_MIN }}
            >
              {hours.slice(0, -1).map((h) => (
                <div
                  key={h}
                  className="absolute inset-x-0 border-t border-slate-100"
                  style={{ top: (h - DAY_START) * PX_PER_MIN }}
                />
              ))}
              {layoutDay(byDay[di]).map((b, i) => (
                <Link
                  key={i}
                  to={`/course-form?course=${b.slot.course.id}`}
                  className="absolute overflow-hidden rounded-md p-1 text-xs leading-tight text-white shadow-sm"
                  style={{
                    top: Math.max(0, (b.slot.startMin - DAY_START) * PX_PER_MIN) + 1,
                    height: Math.max(18, (b.slot.endMin - b.slot.startMin) * PX_PER_MIN - 2),
                    left: `calc(${b.left * 100}% + 2px)`,
                    width: `calc(${b.width * 100}% - 4px)`,
                    backgroundColor: b.slot.course.color,
                  }}
                >
                  {b.slot.course.name}
                  <br />
                  {slotToString(b.slot.startMin)}
                  {describeWeeksShort(b.slot.weeks) && ` · ${describeWeeksShort(b.slot.weeks)}`}
                </Link>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function SchedulePage() {
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [semesterStart, setSemesterStart] = useState<string | null>(null);
  const [weekNow, setWeekNow] = useState<number | null>(null);

  const reload = () => getCourses().then(setCourses);
  useEffect(() => {
    reload();
    getSettings().then((s) => {
      setSemesterStart(s.semesterStart);
      if (s.semesterStart) setWeekNow(teachingWeek(Date.now(), s.semesterStart));
    });
  }, []);

  async function onSemesterStartChange(v: string) {
    setSemesterStart(v || null);
    await saveSettings({ semesterStart: v || null });
    setWeekNow(v ? teachingWeek(Date.now(), v) : null);
  }

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-bold">课表</h1>
        <Link to="/course-form" className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white">
          ＋ 新课程
        </Link>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2.5 text-sm">
        <span className="text-slate-500">本学期第一周</span>
        <input
          type="date"
          value={semesterStart ?? ''}
          onChange={(e) => onSemesterStartChange(e.target.value)}
          className="rounded border border-slate-300 bg-white px-2 py-1"
        />
        {weekNow != null && weekNow >= 1 && (
          <span className="text-slate-400">
            当前第 <b className="text-slate-700">{weekNow}</b> 教学周
          </span>
        )}
        {!semesterStart && (
          <span className="text-xs text-slate-400">
            设置后单双周课程才能自动归档，时间线会显示"第几堂"
          </span>
        )}
      </div>
      {courses === null ? (
        <p className="text-sm text-slate-400">加载中…</p>
      ) : (
        <>
          {courses.length === 0 ? (
            <p className="mb-3 rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
              还没有课程，点右上角"新课程"开始录入
            </p>
          ) : (
            <div className="mb-3">
              <WeekView courses={courses} />
            </div>
          )}
          {courses.length > 0 && (
            <ul className="space-y-2">
              {courses.map((c) => (
                <li key={c.id}>
                  <Link
                    to={`/course/${c.id}`}
                    className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3"
                  >
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: c.color }}
                    />
                    <span className="font-medium">{c.name}</span>
                    <span className="ml-auto text-xs text-slate-400">
                      {c.slots
                        .map(
                          (s) =>
                            `${WEEKDAY_NAMES[s.weekday]} ${slotToString(s.startMin)}${
                              describeWeeksShort(s.weeks) ? `(${describeWeeksShort(s.weeks)})` : ''
                            }`,
                        )
                        .join('、') || '未设时间'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
