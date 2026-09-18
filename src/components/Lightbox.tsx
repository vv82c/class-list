import { useEffect, useRef, useState } from 'react';
import { formatTime } from '../lib/ui';
import { readFile } from '../storage/opfs';
import { displayFile, type Course, type PhotoMeta } from '../types';

interface View {
  zoom: number;
  x: number;
  y: number;
}

const IDENTITY: View = { zoom: 1, x: 0, y: 0 };
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

interface Props {
  photos: PhotoMeta[];
  index: number;
  courses: Course[];
  onIndex: (i: number) => void;
  onClose: () => void;
  onRecrop: (photo: PhotoMeta) => void;
  onToggleStar: (photo: PhotoMeta) => void;
}

/** 全屏大图复习：键盘 ← → 翻页、空格连播、Esc 关闭；滚轮缩放、拖动平移、双击放大/复位 */
export default function Lightbox({ photos, index, courses, onIndex, onClose, onRecrop, onToggleStar }: Props) {
  const photo = photos[index];
  const [variant, setVariant] = useState<'crop' | 'original'>('crop');
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [url, setUrl] = useState<string | null>(null);
  const [starred, setStarred] = useState(!!photo?.starred);
  const [view, setView] = useState<View>(IDENTITY);
  const [playing, setPlaying] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const onIndexRef = useRef(onIndex);
  onIndexRef.current = onIndex;

  useEffect(() => {
    setVariant(photo?.cropFileName ? 'crop' : 'original');
  }, [photo?.id, photo?.cropFileName]);

  // 换照片时复位缩放与标星的乐观显示
  useEffect(() => {
    setView(IDENTITY);
    setStarred(!!photo?.starred);
  }, [photo?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // 连播：每 3 秒自动翻页，到最后一张回卷
  useEffect(() => {
    if (!playing || photos.length < 2) return;
    const t = setInterval(() => onIndexRef.current((index + 1) % photos.length), 3000);
    return () => clearInterval(t);
  }, [playing, index, photos.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onIndexRef.current(Math.max(0, index - 1));
      if (e.key === 'ArrowRight') onIndexRef.current(Math.min(photos.length - 1, index + 1));
      if (e.key === ' ') {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, photos.length, onClose]);

  // 缩放以指定点（相对图片布局中心）为锚，平移范围夹紧到图片中心不出画布
  function zoomAt(factor: number, cx: number, cy: number) {
    setView((v) => {
      const zoom = clamp(v.zoom * factor, 1, 8);
      if (zoom === 1) return IDENTITY;
      const k = zoom / v.zoom;
      const rect = boxRef.current?.getBoundingClientRect();
      const mx = rect ? (rect.width * zoom) / 2 : Infinity;
      const my = rect ? (rect.height * zoom) / 2 : Infinity;
      return {
        zoom,
        x: clamp(cx * (1 - k) + v.x * k, -mx, mx),
        y: clamp(cy * (1 - k) + v.y * k, -mx, my),
      };
    });
  }

  // React 的 onWheel 是 passive 的，preventDefault 必须挂原生监听
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = box.getBoundingClientRect();
      const cx = e.clientX - (rect.left + rect.width / 2);
      const cy = e.clientY - (rect.top + rect.height / 2);
      zoomAt(e.deltaY < 0 ? 1.25 : 0.8, cx, cy);
    };
    box.addEventListener('wheel', onWheel, { passive: false });
    return () => box.removeEventListener('wheel', onWheel);
  });

  function onPointerDown(e: React.PointerEvent) {
    if (view.zoom === 1) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY };
  }
  function onPointerMove(e: React.PointerEvent) {
    const start = dragRef.current;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    dragRef.current = { x: e.clientX, y: e.clientY };
    setView((v) => {
      const rect = boxRef.current?.getBoundingClientRect();
      const mx = rect ? (rect.width * v.zoom) / 2 : Infinity;
      const my = rect ? (rect.height * v.zoom) / 2 : Infinity;
      return { ...v, x: clamp(v.x + dx, -mx, mx), y: clamp(v.y + dy, -my, my) };
    });
  }
  function onPointerUp() {
    dragRef.current = null;
  }
  function onDoubleClick(e: React.MouseEvent) {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (view.zoom === 1) {
      zoomAt(2.5, e.clientX - (rect.left + rect.width / 2), e.clientY - (rect.top + rect.height / 2));
    } else {
      setView(IDENTITY);
    }
  }

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
        <button
          onClick={() => {
            setStarred((s) => !s);
            onToggleStar(photo);
          }}
          className={`rounded-lg px-2 py-1 hover:bg-white/10 ${starred ? 'font-medium text-amber-400' : 'text-slate-300'}`}
        >
          {starred ? '★ 已标星' : '☆ 标星'}
        </button>
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

      <div
        ref={boxRef}
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-2"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
      >
        {url ? (
          <img
            src={url}
            alt=""
            draggable={false}
            className="max-h-full max-w-full select-none object-contain"
            style={{
              transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
              cursor: view.zoom > 1 ? 'grab' : 'zoom-in',
            }}
          />
        ) : (
          <p className="text-sm text-slate-400">
            {status === 'missing' ? '这张照片的图片文件已丢失（记录仍在，可删除该条目）' : '读取中…'}
          </p>
        )}
        <p className="pointer-events-none absolute bottom-1.5 left-3 text-xs text-slate-500">
          滚轮缩放 · 双击放大/复位{view.zoom > 1 ? ` · ${Math.round(view.zoom * 100)}%` : ''}
        </p>
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
        {photos.length > 1 && (
          <button
            onClick={() => setPlaying((p) => !p)}
            className={`rounded-lg px-4 py-2 text-sm ${
              playing ? 'bg-sky-500 text-white' : 'bg-white/10 text-white'
            }`}
          >
            {playing ? '⏸ 暂停' : '▶ 连播'}
          </button>
        )}
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
