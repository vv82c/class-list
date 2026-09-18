import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { deleteCourse, getCourse, newId, putCourse } from '../storage/db';
import { WEEKDAY_NAMES, type Course, type ScheduleSlot } from '../types';

export const COURSE_COLORS = ['#0ea5e9', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#64748b'];

function toTime(min: number) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(min / 60))}:${p(min % 60)}`;
}

function fromTime(s: string) {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

interface SlotDraft {
  weekday: number;
  start: string;
  end: string;
}

export default function CourseFormPage() {
  const { id } = useParams<{ id?: string }>();
  const [search] = useSearchParams();
  const editId = id ?? search.get('course');
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [color, setColor] = useState(COURSE_COLORS[0]);
  const [slots, setSlots] = useState<SlotDraft[]>([]);
  const [loaded, setLoaded] = useState(!editId);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!editId) return;
    getCourse(editId).then((c) => {
      if (!c) {
        navigate('/', { replace: true });
        return;
      }
      setName(c.name);
      setColor(c.color);
      setSlots(
        c.slots.map((s) => ({
          weekday: s.weekday,
          start: toTime(s.startMin),
          end: toTime(s.endMin),
        })),
      );
      setLoaded(true);
    });
  }, [editId, navigate]);

  function updateSlot(index: number, patch: Partial<SlotDraft>) {
    setSlots((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function addSlot() {
    setSlots((prev) => [...prev, { weekday: 1, start: '08:00', end: '09:40' }]);
  }

  async function onSave() {
    setError('');
    const trimmed = name.trim();
    if (!trimmed) {
      setError('请填写课程名称');
      return;
    }
    const normalized: ScheduleSlot[] = slots.map((s) => ({
      weekday: s.weekday,
      startMin: fromTime(s.start),
      endMin: fromTime(s.end),
    }));
    if (normalized.some((s) => s.endMin <= s.startMin)) {
      setError('存在结束时间不晚于开始时间的时间槽');
      return;
    }
    const course: Course = {
      id: editId ?? newId(),
      name: trimmed,
      color,
      slots: normalized,
      createdAt: editId ? undefined! : Date.now(),
    };
    if (editId) {
      const old = await getCourse(editId);
      course.createdAt = old?.createdAt ?? Date.now();
    }
    await putCourse(course);
    navigate('/');
  }

  async function onDelete() {
    if (!editId) return;
    if (!confirm('删除该课程？已归属本课的照片会回到"未分类"。')) return;
    await deleteCourse(editId);
    navigate('/');
  }

  if (!loaded) return <p className="p-4 text-sm text-slate-400">加载中…</p>;

  return (
    <div className="p-4">
      <h1 className="mb-4 text-xl font-bold">{editId ? '编辑课程' : '新增课程'}</h1>

      <label className="mb-1 block text-sm text-slate-500">课程名称</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="如：高等数学"
        className="mb-4 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-sky-500"
      />

      <label className="mb-1 block text-sm text-slate-500">颜色</label>
      <div className="mb-4 flex gap-2">
        {COURSE_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            className={`h-7 w-7 rounded-full ${color === c ? 'ring-2 ring-slate-900 ring-offset-2' : ''}`}
            style={{ backgroundColor: c }}
            aria-label={`颜色 ${c}`}
          />
        ))}
      </div>

      <div className="mb-1 flex items-center justify-between">
        <label className="block text-sm text-slate-500">上课时间</label>
        <button
          type="button"
          onClick={addSlot}
          className="rounded-lg bg-slate-900 px-3 py-1 text-sm text-white"
        >
          ＋ 时间段
        </button>
      </div>
      {slots.length === 0 ? (
        <p className="mb-4 rounded-lg border border-dashed border-slate-300 p-3 text-center text-sm text-slate-400">
          还没有时间段，点右上角添加（自动归档依赖它）
        </p>
      ) : (
        <ul className="mb-4 space-y-2">
          {slots.map((s, i) => (
            <li key={i} className="flex items-center gap-2 rounded-lg bg-white p-2 ring-1 ring-slate-200">
              <select
                value={s.weekday}
                onChange={(e) => updateSlot(i, { weekday: Number(e.target.value) })}
                className="rounded border border-slate-300 bg-white px-1 py-1 text-sm"
              >
                {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                  <option key={d} value={d}>
                    {WEEKDAY_NAMES[d]}
                  </option>
                ))}
              </select>
              <input
                type="time"
                value={s.start}
                onChange={(e) => updateSlot(i, { start: e.target.value })}
                className="w-24 rounded border border-slate-300 bg-white px-1 py-1 text-sm"
              />
              <span className="text-slate-400">—</span>
              <input
                type="time"
                value={s.end}
                onChange={(e) => updateSlot(i, { end: e.target.value })}
                className="w-24 rounded border border-slate-300 bg-white px-1 py-1 text-sm"
              />
              <button
                type="button"
                onClick={() => setSlots((prev) => prev.filter((_, j) => j !== i))}
                className="ml-auto px-2 text-slate-400"
                aria-label="删除时间段"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      {slots.length > 0 && (
        <p className="mb-4 text-xs text-slate-400">
          预览：{slots.map((s) => `${WEEKDAY_NAMES[s.weekday]} ${s.start}-${s.end}`).join('、')}
        </p>
      )}

      {error && <p className="mb-4 rounded-lg bg-red-50 p-2 text-sm text-red-600">{error}</p>}

      <div className="flex gap-3">
        <button onClick={onSave} className="flex-1 rounded-xl bg-slate-900 py-3 text-white">
          保存
        </button>
        {editId && (
          <button onClick={onDelete} className="rounded-xl border border-red-200 px-4 py-3 text-red-500">
            删除
          </button>
        )}
        <button
          onClick={() => navigate('/')}
          className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-500"
        >
          取消
        </button>
      </div>
    </div>
  );
}
