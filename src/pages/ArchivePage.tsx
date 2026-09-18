import { useEffect, useState } from 'react';
import Lightbox from '../components/Lightbox';
import RecropDialog from '../components/RecropDialog';
import { formatTime, usePhotoUrl } from '../lib/ui';
import { matchCourse, teachingWeek } from '../lib/matching';
import { deletePhoto, getCourses, getPhotos, getSettings, putPhoto } from '../storage/db';
import { displayFile, type Annotation, type Course, type PhotoMeta } from '../types';

type Filter = 'all' | 'pending' | 'uncategorized' | 'starred';

function Thumb({ photo, onOpen }: { photo: PhotoMeta; onOpen?: () => void }) {
  const url = usePhotoUrl(displayFile(photo));
  return (
    <div
      onClick={onOpen}
      className={`relative aspect-square w-full overflow-hidden rounded-lg bg-slate-200 ${onOpen ? 'cursor-zoom-in' : ''}`}
    >
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <div className="flex h-full items-center justify-center text-[10px] text-slate-400">
          读取中…
        </div>
      )}
      {photo.cropFileName && (
        <span className="absolute bottom-0.5 left-0.5 rounded bg-black/55 px-1 text-[9px] text-white">
          裁
        </span>
      )}
      {photo.starred && (
        <span className="absolute left-1 top-1 rounded bg-black/55 px-1 text-[11px] leading-4">
          ⭐
        </span>
      )}
    </div>
  );
}

function PendingCard({
  photo,
  courses,
  onAction,
  onOpen,
}: {
  photo: PhotoMeta;
  courses: Course[];
  onAction: () => void;
  onOpen: () => void;
}) {
  const course = courses.find((c) => c.id === photo.courseId);
  return (
    <div className="rounded-xl border border-amber-200 bg-white p-2">
      <Thumb photo={photo} onOpen={onOpen} />
      <p className="mt-1 text-[10px] text-slate-400">{formatTime(photo.takenAt)}</p>
      <div className="mt-1 flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: course?.color }} />
        <span className="truncate text-xs font-medium">{course?.name ?? '未知课程'}</span>
      </div>
      <div className="mt-1.5 flex gap-1.5">
        <button
          onClick={async () => {
            await putPhoto({ ...photo, capture: 'manual' });
            onAction();
          }}
          className="flex-1 rounded-lg bg-slate-900 py-1.5 text-xs text-white"
        >
          确认
        </button>
        <select
          value=""
          onChange={async (e) => {
            if (!e.target.value) return;
            await putPhoto({ ...photo, courseId: e.target.value, capture: 'manual' });
            onAction();
          }}
          className="rounded-lg border border-slate-300 bg-white px-1 text-xs text-slate-600"
        >
          <option value="">改归属…</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export default function ArchivePage() {
  const [photos, setPhotos] = useState<PhotoMeta[] | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [viewIndex, setViewIndex] = useState<number | null>(null);
  const [recrop, setRecrop] = useState<PhotoMeta | null>(null);

  const reload = async () => {
    setPhotos(await getPhotos());
    setCourses(await getCourses());
  };
  useEffect(() => {
    reload();
  }, []);

  const pendingCount = photos?.filter((p) => p.capture === 'auto').length ?? 0;
  const starredCount = photos?.filter((p) => p.starred).length ?? 0;
  const shown =
    photos === null
      ? null
      : filter === 'all'
        ? photos
        : filter === 'pending'
          ? photos.filter((p) => p.capture === 'auto')
          : filter === 'starred'
            ? photos.filter((p) => p.starred)
            : photos.filter((p) => !p.courseId);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelect() {
    setSelectMode(false);
    setSelected(new Set());
  }

  async function deleteOne(photo: PhotoMeta) {
    if (!confirm('删除这张照片？此操作不可撤销。')) return;
    await deletePhoto(photo);
    await reload();
  }

  async function toggleStar(photo: PhotoMeta) {
    await putPhoto({ ...photo, starred: !photo.starred });
    // 在"重点"过滤下取消标星后这张图会从列表消失，关掉大图避免指向错位
    if (filter === 'starred' && photo.starred) setViewIndex(null);
    await reload();
  }

  async function saveAnnotations(photo: PhotoMeta, annotations: Annotation[]) {
    await putPhoto({ ...photo, annotations });
    await reload();
  }

  /** 按当前课表（含单双周/周范围）重算本学期内"自动归档/未分类"照片的归属 */
  async function reassignAll() {
    const { semesterStart } = await getSettings();
    if (
      !confirm(
        '将按当前课表（含单双周设置）重新计算照片归属，只影响"自动归档"和"未分类"的照片，手动改过的不动。继续？',
      )
    )
      return;
    const list = photos ?? [];
    let changed = 0;
    for (const p of list) {
      if (p.capture === 'manual' || p.takenAt == null) continue;
      // 学期外的照片不参与（避免把往学期照片清成未分类）
      if (semesterStart && teachingWeek(p.takenAt, semesterStart) < 1) continue;
      const m = matchCourse(p, courses, semesterStart);
      const courseId = m?.courseId ?? '';
      const capture = m ? 'auto' : 'none';
      if (courseId !== p.courseId || capture !== p.capture) {
        await putPhoto({ ...p, courseId, capture });
        changed++;
      }
    }
    await reload();
    alert(`重新归课完成：${changed} 张照片的归属被更新。`);
  }

  async function deleteSelected() {
    if (!selected.size) return;
    if (!confirm(`删除选中的 ${selected.size} 张照片？此操作不可撤销。`)) return;
    const targets = (photos ?? []).filter((p) => selected.has(p.id));
    for (const photo of targets) await deletePhoto(photo);
    exitSelect();
    await reload();
  }

  return (
    <div className={`p-4 ${selectMode ? 'pb-24' : ''}`}>
      <h1 className="mb-1 text-xl font-bold">归档</h1>
      <p className="mb-3 text-sm text-slate-500">按拍摄时间自动归课，待确认的请核对</p>
      <div className="mb-3 flex items-center gap-2 text-sm">
        {(
          [
            ['all', '全部'],
            ['pending', `待确认${pendingCount ? ` (${pendingCount})` : ''}`],
            ['uncategorized', '未分类'],
            ['starred', `⭐ 重点${starredCount ? ` (${starredCount})` : ''}`],
          ] as [Filter, string][]
        ).map(([f, label]) => (
          <button
            key={f}
            onClick={() => {
              setFilter(f);
              exitSelect();
            }}
            className={`rounded-full px-3 py-1 ${
              filter === f
                ? f === 'pending'
                  ? 'bg-amber-500 text-white'
                  : f === 'starred'
                    ? 'bg-amber-400 text-slate-900'
                    : 'bg-slate-900 text-white'
                : 'bg-white text-slate-500 ring-1 ring-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
        <button
          onClick={reassignAll}
          className="rounded-full bg-white px-3 py-1 text-slate-500 ring-1 ring-slate-200"
          title="按当前课表（含单双周）重算自动归档照片的归属"
        >
          重新归课
        </button>
        <button
          onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
          className="ml-auto shrink-0 rounded-full bg-white px-3 py-1 text-slate-500 ring-1 ring-slate-200"
        >
          {selectMode ? '取消' : '多选'}
        </button>
      </div>
      {shown === null ? (
        <p className="text-sm text-slate-400">加载中…</p>
      ) : shown.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
          {filter === 'pending'
            ? '没有待确认的照片'
            : filter === 'starred'
              ? '还没有标星照片，打开大图点「☆ 标星」标记重点'
              : filter === 'uncategorized'
                ? '没有未分类照片'
                : '还没有照片，去"拍照"页导入一些吧'}
        </p>
      ) : (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {shown.map((p, i) => {
            const isSelected = selected.has(p.id);
            return (
              <li
                key={p.id}
                onClick={selectMode ? () => toggleSelect(p.id) : undefined}
                className={`relative ${selectMode ? 'cursor-pointer' : ''}`}
              >
                {filter === 'pending' && !selectMode ? (
                  <PendingCard
                    photo={p}
                    courses={courses}
                    onAction={reload}
                    onOpen={() => setViewIndex(i)}
                  />
                ) : (
                  <>
                    <Thumb photo={p} onOpen={selectMode ? undefined : () => setViewIndex(i)} />
                    <p className="mt-0.5 text-[10px] leading-tight text-slate-400">
                      {formatTime(p.takenAt)}
                    </p>
                  </>
                )}
                {selectMode ? (
                  <span
                    className={`absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-bold ${
                      isSelected
                        ? 'border-sky-500 bg-sky-500 text-white'
                        : 'border-white/80 bg-black/40 text-transparent'
                    }`}
                    aria-hidden
                  >
                    ✓
                  </span>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteOne(p);
                    }}
                    className="absolute right-1 top-1 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-sm text-white"
                    aria-label="删除"
                  >
                    ✕
                  </button>
                )}
                {isSelected && (
                  <span className="pointer-events-none absolute inset-0 rounded-lg ring-2 ring-sky-500" />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {selectMode && (
        <div className="fixed bottom-6 left-56 right-0 z-20 flex justify-center px-6">
          <div className="flex items-center gap-3 rounded-xl bg-slate-900 p-2 pl-4 text-white shadow-lg">
            <span className="text-sm">已选 {selected.size}</span>
            <button
              disabled={!selected.size}
              onClick={deleteSelected}
              className="ml-auto rounded-lg bg-red-500 px-4 py-2 text-sm disabled:opacity-40"
            >
              删除
            </button>
            <button
              onClick={() => setSelected(new Set(shown?.map((p) => p.id) ?? []))}
              className="rounded-lg px-3 py-2 text-sm text-slate-300"
            >
              全选
            </button>
          </div>
        </div>
      )}

      {viewIndex !== null && shown && (
        <Lightbox
          photos={shown}
          index={viewIndex}
          courses={courses}
          onIndex={setViewIndex}
          onClose={() => setViewIndex(null)}
          onToggleStar={toggleStar}
          onSaveAnnotations={saveAnnotations}
          onRecrop={(p) => {
            setViewIndex(null);
            setRecrop(p);
          }}
        />
      )}
      {recrop && <RecropDialog photo={recrop} onClose={() => setRecrop(null)} onSaved={reload} />}
    </div>
  );
}
