import { useEffect, useState } from 'react';
import { formatTime, usePhotoUrl } from '../lib/ui';
import { deletePhoto, getCourses, getPhotos, putPhoto } from '../storage/db';
import type { Course, PhotoMeta } from '../types';

type Filter = 'all' | 'pending' | 'uncategorized';

function Thumb({ photo }: { photo: PhotoMeta }) {
  const url = usePhotoUrl(photo.thumbFileName ?? photo.fileName);
  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-slate-200">
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
    </div>
  );
}

function PendingCard({
  photo,
  courses,
  onAction,
}: {
  photo: PhotoMeta;
  courses: Course[];
  onAction: () => void;
}) {
  const course = courses.find((c) => c.id === photo.courseId);
  return (
    <div className="rounded-xl border border-amber-200 bg-white p-2">
      <Thumb photo={photo} />
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

  const reload = async () => {
    setPhotos(await getPhotos());
    setCourses(await getCourses());
  };
  useEffect(() => {
    reload();
  }, []);

  const pendingCount = photos?.filter((p) => p.capture === 'auto').length ?? 0;
  const shown =
    photos === null
      ? null
      : filter === 'all'
        ? photos
        : filter === 'pending'
          ? photos.filter((p) => p.capture === 'auto')
          : photos.filter((p) => !p.courseId);

  return (
    <div className="p-4">
      <h1 className="mb-1 text-xl font-bold">归档</h1>
      <p className="mb-3 text-sm text-slate-500">按拍摄时间自动归课，待确认的请核对</p>
      <div className="mb-3 flex gap-2 text-sm">
        {(
          [
            ['all', '全部'],
            ['pending', `待确认${pendingCount ? ` (${pendingCount})` : ''}`],
            ['uncategorized', '未分类'],
          ] as [Filter, string][]
        ).map(([f, label]) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 ${
              filter === f
                ? f === 'pending'
                  ? 'bg-amber-500 text-white'
                  : 'bg-slate-900 text-white'
                : 'bg-white text-slate-500 ring-1 ring-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {shown === null ? (
        <p className="text-sm text-slate-400">加载中…</p>
      ) : shown.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
          {filter === 'pending' ? '没有待确认的照片' : filter === 'uncategorized' ? '没有未分类照片' : '还没有照片，去"拍照"页导入一些吧'}
        </p>
      ) : (
        <ul className="grid grid-cols-3 gap-2">
          {shown.map((p) => (
            <li key={p.id} className="group relative">
              {filter === 'pending' ? (
                <PendingCard photo={p} courses={courses} onAction={reload} />
              ) : (
                <>
                  <Thumb photo={p} />
                  <p className="mt-0.5 text-[10px] leading-tight text-slate-400">
                    {formatTime(p.takenAt)}
                  </p>
                </>
              )}
              <button
                onClick={() => deletePhoto(p).then(reload)}
                className="absolute right-1 top-1 z-10 hidden h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs text-white group-hover:flex"
                aria-label="删除"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
