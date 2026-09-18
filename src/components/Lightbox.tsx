import { useEffect, useState } from 'react';
import { formatTime } from '../lib/ui';
import { readFile } from '../storage/opfs';
import { displayFile, type Course, type PhotoMeta } from '../types';

interface Props {
  photos: PhotoMeta[];
  index: number;
  courses: Course[];
  onIndex: (i: number) => void;
  onClose: () => void;
  onRecrop: (photo: PhotoMeta) => void;
}

/** 全屏大图复习：键盘 ← → 翻页、Esc 关闭，可在裁剪图与原图间切换 */
export default function Lightbox({ photos, index, courses, onIndex, onClose, onRecrop }: Props) {
  const photo = photos[index];
  const [variant, setVariant] = useState<'crop' | 'original'>('crop');
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    setVariant(photo?.cropFileName ? 'crop' : 'original');
  }, [photo?.id, photo?.cropFileName]);

  const wanted = photo ? (variant === 'crop' ? photo.cropFileName : photo.fileName) : undefined;

  useEffect(() => {
    let dead = false;
    let objectUrl: string | null = null;
    setUrl(null);
    setStatus('loading');
    if (!photo) return;
    (async () => {
      // 请求的版本可能在磁盘上不存在（如原图已清理），退回可用文件
      const candidates = [wanted, displayFile(photo)].filter((v): v is string => !!v);
      for (const name of candidates) {
        const file = await readFile(name);
        if (dead) return;
        if (file) {
          objectUrl = URL.createObjectURL(file);
          setUrl(objectUrl);
          setStatus('ready');
          return;
        }
      }
      if (!dead) setStatus('missing');
    })();
    return () => {
      dead = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photo, wanted]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onIndex(Math.max(0, index - 1));
      if (e.key === 'ArrowRight') onIndex(Math.min(photos.length - 1, index + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, photos.length, onIndex, onClose]);

  if (!photo) return null;
  const course = courses.find((c) => c.id === photo.courseId);
  const canOriginal = !photo.originalRemoved && !!photo.fileName;

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-black/95" onClick={onClose}>
      <div
        className="flex items-center gap-3 px-4 py-3 text-sm text-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {course && (
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: course.color }} />
            {course.name}
          </span>
        )}
        <span className="text-slate-400">{formatTime(photo.takenAt)}</span>
        <span className="ml-auto text-slate-400">
          {index + 1} / {photos.length}
        </span>
        <button
          onClick={onClose}
          className="rounded-lg px-2 py-1 text-slate-300 hover:bg-white/10"
        >
          关闭 ✕
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center px-2" onClick={(e) => e.stopPropagation()}>
        {url ? (
          <img src={url} alt="" className="max-h-full max-w-full object-contain" />
        ) : (
          <p className="text-sm text-slate-400">
            {status === 'missing' ? '这张照片的图片文件已丢失（记录仍在，可删除该条目）' : '读取中…'}
          </p>
        )}
      </div>

      <div
        className="flex items-center justify-center gap-2 px-4 py-3"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => onIndex(Math.max(0, index - 1))}
          disabled={index === 0}
          className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white disabled:opacity-30"
        >
          ← 上一张
        </button>
        {photo.cropFileName && canOriginal && (
          <button
            onClick={() => setVariant(variant === 'crop' ? 'original' : 'crop')}
            className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white"
          >
            看{variant === 'crop' ? '原图' : '裁剪图'}
          </button>
        )}
        {canOriginal && (
          <button
            onClick={() => onRecrop(photo)}
            className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white"
          >
            重新裁剪
          </button>
        )}
        <button
          onClick={() => onIndex(Math.min(photos.length - 1, index + 1))}
          disabled={index >= photos.length - 1}
          className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white disabled:opacity-30"
        >
          下一张 →
        </button>
      </div>
    </div>
  );
}
