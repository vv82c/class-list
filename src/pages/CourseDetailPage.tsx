import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Lightbox from '../components/Lightbox';
import RecropDialog from '../components/RecropDialog';
import { groupSessions } from '../lib/sessions';
import { usePhotoUrl } from '../lib/ui';
import { getCourse, getPhotosByCourse } from '../storage/db';
import { displayFile, type Course, type PhotoMeta } from '../types';

function Cell({ photo, onOpen }: { photo: PhotoMeta; onOpen: () => void }) {
  const url = usePhotoUrl(displayFile(photo));
  return (
    <button
      onClick={onOpen}
      className="aspect-square w-full cursor-zoom-in overflow-hidden rounded-lg bg-slate-200 text-left"
    >
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <span className="flex h-full items-center justify-center text-[10px] text-slate-400">…</span>
      )}
    </button>
  );
}

export default function CourseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [course, setCourse] = useState<Course | undefined>();
  const [photos, setPhotos] = useState<PhotoMeta[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [view, setView] = useState<{ photos: PhotoMeta[]; index: number } | null>(null);
  const [recrop, setRecrop] = useState<PhotoMeta | null>(null);
  const [loaded, setLoaded] = useState(false);

  const reload = async () => {
    if (!id) return;
    setCourse(await getCourse(id));
    setPhotos(await getPhotosByCourse(id));
    setLoaded(true);
  };
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!loaded) return <p className="p-4 text-sm text-slate-400">加载中…</p>;

  if (!course) {
    return (
      <div className="p-4 text-sm text-slate-400">
        未找到该课程。<Link to="/" className="text-sky-600 underline">返回课表</Link>
      </div>
    );
  }

  const sessions = groupSessions(photos, [course]);

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center gap-2">
        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: course.color }} />
        <h1 className="text-xl font-bold">{course.name}</h1>
        <span className="ml-auto text-sm text-slate-400">{photos.length} 张 · {sessions.length} 堂课</span>
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
                  <span className="text-xs text-slate-400">{s.count} 张</span>
                  <span className="ml-auto text-xs text-slate-400">{isOpen ? '收起' : '展开'}</span>
                </button>
                {isOpen && (
                  <div className="grid grid-cols-3 gap-2 p-3 pt-0 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
                    {s.photos.map((p, i) => (
                      <Cell
                        key={p.id}
                        photo={p}
                        onOpen={() => setView({ photos: s.photos, index: i })}
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
          onIndex={(i) => setView({ ...view, index: i })}
          onClose={() => setView(null)}
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
