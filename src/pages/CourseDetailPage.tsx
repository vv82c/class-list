import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Lightbox from '../components/Lightbox';
import RecropDialog from '../components/RecropDialog';
import { teachingWeek } from '../lib/matching';
import { groupSessions } from '../lib/sessions';
import { usePhotoUrl } from '../lib/ui';
import { getCourse, getPhotosByCourse, getSettings, putPhoto } from '../storage/db';
import { displayFile, type Annotation, type Course, type PhotoMeta } from '../types';

function Cell({ photo, onOpen }: { photo: PhotoMeta; onOpen: () => void }) {
  const url = usePhotoUrl(displayFile(photo));
  return (
    <button
      onClick={onOpen}
      className="relative aspect-square w-full cursor-zoom-in overflow-hidden rounded-lg bg-slate-200 text-left"
    >
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <span className="flex h-full items-center justify-center text-[10px] text-slate-400">…</span>
      )}
      {photo.starred && (
        <span className="absolute left-1 top-1 rounded bg-black/55 px-1 text-[11px] leading-4">
          ⭐
        </span>
      )}
      {!!photo.annotations?.length && (
        <span className="absolute bottom-0.5 right-0.5 rounded bg-black/55 px-1 text-[9px] leading-4 text-white">
          注
        </span>
      )}
    </button>
  );
}

export default function CourseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [course, setCourse] = useState<Course | undefined>();
  const [photos, setPhotos] = useState<PhotoMeta[]>([]);
  const [semesterStart, setSemesterStart] = useState<string | null>(null);
  const [weekFilter, setWeekFilter] = useState<'all' | number>('all');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [view, setView] = useState<{ photos: PhotoMeta[]; index: number; number: number | null } | null>(null);
  const [recrop, setRecrop] = useState<PhotoMeta | null>(null);
  const [loaded, setLoaded] = useState(false);

  const reload = async () => {
    if (!id) return;
    const [c, ps, s] = await Promise.all([getCourse(id), getPhotosByCourse(id), getSettings()]);
    setCourse(c);
    setPhotos(ps);
    setSemesterStart(s.semesterStart);
    setLoaded(true);
  };
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function toggleStar(photo: PhotoMeta) {
    await putPhoto({ ...photo, starred: !photo.starred });
    await reload();
  }

  async function saveAnnotations(photo: PhotoMeta, annotations: Annotation[]) {
    await putPhoto({ ...photo, annotations });
    await reload();
  }

  if (!loaded) return <p className="p-4 text-sm text-slate-400">加载中…</p>;

  if (!course) {
    return (
      <div className="p-4 text-sm text-slate-400">
        未找到该课程。<Link to="/" className="text-sky-600 underline">返回课表</Link>
      </div>
    );
  }

  // 复习进度：记住这门课上次看过的照片（仅标记，不自动跳转）
  const lastViewedId = course ? localStorage.getItem(`classlist:lastview:${course.id}`) : null;
  function openPhoto(sessionPhotos: PhotoMeta[], index: number, number: number | null) {
    localStorage.setItem(`classlist:lastview:${course?.id ?? ''}`, sessionPhotos[index].id);
    setView({ photos: sessionPhotos, index, number });
  }

  const weekOptions = semesterStart
    ? [
        ...new Set(
          photos
            .map((p) => (p.takenAt != null ? teachingWeek(p.takenAt, semesterStart) : null))
            .filter((w): w is number => w != null && w >= 1),
        ),
      ].sort((a, b) => a - b)
    : [];
  const shownPhotos =
    weekFilter === 'all'
      ? photos
      : photos.filter((p) => p.takenAt != null && teachingWeek(p.takenAt, semesterStart!) === weekFilter);
  const sessions = groupSessions(shownPhotos, [course], semesterStart);
  const lastSessionKey = lastViewedId ? sessions.find((s) => s.photos.some((p) => p.id === lastViewedId))?.key : null;

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center gap-2">
        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: course.color }} />
        <h1 className="text-xl font-bold">{course.name}</h1>
        <span className="ml-auto text-sm text-slate-400">{photos.length} 张 · {sessions.length} 堂课</span>
        {weekOptions.length > 0 && (
          <select
            value={String(weekFilter)}
            onChange={(e) => setWeekFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="rounded border border-slate-300 bg-white px-1.5 py-1 text-sm text-slate-600"
          >
            <option value="all">全部周次</option>
            {weekOptions.map((w) => (
              <option key={w} value={w}>
                第{w}周
              </option>
            ))}
          </select>
        )}
        <Link
          to={`/course-form?course=${course.id}`}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm text-slate-600"
        >
          编辑
        </Link>
      </div>

      {sessions.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
          这门课还没有照片。拍照后按上课时间会自动归到这里。
        </p>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => {
            const isOpen = !collapsed.has(s.key);
            return (
              <section key={s.key} className="overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
                <button
                  onClick={() =>
                    setCollapsed((prev) => {
                      const next = new Set(prev);
                      if (next.has(s.key)) next.delete(s.key);
                      else next.add(s.key);
                      return next;
                    })
                  }
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
                >
                  <span className="text-sm font-medium">{s.title}</span>
                  {lastSessionKey === s.key && (
                    <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] text-sky-700">
                      上次看到
                    </span>
                  )}
                  <span className="ml-auto text-xs text-slate-400">{s.count} 张</span>
                  <span className="text-xs text-slate-400">{isOpen ? '收起' : '展开'}</span>
                </button>
                {isOpen && (
                  <div className="grid grid-cols-3 gap-2 p-3 pt-0 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
                    {s.photos.map((p, i) => (
                      <Cell
                        key={p.id}
                        photo={p}
                        onOpen={() => openPhoto(s.photos, i, s.number)}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {view && (
        <Lightbox
          photos={view.photos}
          index={view.index}
          courses={[course]}
          sessionNumber={view.number}
          onIndex={(i) => setView({ ...view, index: i })}
          onClose={() => setView(null)}
          onToggleStar={toggleStar}
          onSaveAnnotations={saveAnnotations}
          onRecrop={(p) => {
            setView(null);
            setRecrop(p);
          }}
        />
      )}
      {recrop && <RecropDialog photo={recrop} onClose={() => setRecrop(null)} onSaved={reload} />}
    </div>
  );
}
