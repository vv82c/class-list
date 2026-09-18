import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getCourse, getPhotosByCourse } from '../storage/db';
import type { Course, PhotoMeta } from '../types';

export default function CourseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [course, setCourse] = useState<Course | undefined>();
  const [photos, setPhotos] = useState<PhotoMeta[]>([]);

  useEffect(() => {
    if (!id) return;
    getCourse(id).then((c) => setCourse(c ?? undefined));
    getPhotosByCourse(id).then(setPhotos);
  }, [id]);

  if (!course) {
    return (
      <div className="p-4 text-sm text-slate-400">
        未找到该课程。<Link to="/" className="text-sky-600 underline">返回课表</Link>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h1 className="mb-1 flex items-center gap-2 text-xl font-bold">
        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: course.color }} />
        {course.name}
      </h1>
      <p className="mb-4 text-sm text-slate-500">
        本课照片 {photos.length} 张（时间线视图在 M5 完善）
      </p>
      {photos.length > 0 && (
        <ul className="space-y-1 text-sm text-slate-600">
          {photos.map((p) => (
            <li key={p.id} className="rounded-lg bg-white p-2 ring-1 ring-slate-200">
              {p.id.slice(0, 8)}… · {new Date(p.takenAt ?? p.createdAt).toLocaleString()}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
