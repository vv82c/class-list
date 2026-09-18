import { useEffect, useRef, useState } from 'react';
import { extractExifDateTime } from '../lib/exif';
import {
  detectQuad,
  makeThumbnail,
  quadTargetSize,
  scaleQuad,
  warpQuad,
  type Quad,
} from '../lib/crop';
import { enhanceDocumentImage } from '../lib/enhance';
import { newId, putPhoto, getCourses } from '../storage/db';
import { matchCourse } from '../lib/matching';
import { saveFile } from '../storage/opfs';
import type { PhotoMeta } from '../types';

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** 原图 + 裁剪图 + 缩略图 + 元数据一次性入库 */
export async function persistPhoto(
  file: Blob,
  mimeType: string,
  crop: { blob: Blob; quad: Quad } | null,
): Promise<PhotoMeta> {
  const id = newId();
  const ext = EXT[mimeType] ?? 'jpg';
  const fileName = `${id}-original.${ext}`;
  const thumbFileName = `${id}-thumb.jpg`;
  const takenAt = await extractExifDateTime(file).catch(() => null);
  const match = matchCourse({ takenAt }, await getCourses());
  let cropBlob: Blob | null = null;
  let cropFileName: string | undefined;
  if (crop) {
    // 裁剪图做一档自动增强（去投影偏色+锐化），原图永远保留可切回
    cropBlob = await enhanceDocumentImage(crop.blob);
    cropFileName = `${id}-crop.jpg`;
  }
  const thumbSource = cropBlob ?? file;
  const bmp = await createImageBitmap(thumbSource);
  const thumb = await makeThumbnail(bmp, bmp.width, bmp.height);
  bmp.close();
  await saveFile(fileName, file);
  await saveFile(thumbFileName, thumb);
  if (cropBlob && cropFileName) await saveFile(cropFileName, cropBlob);
  const meta: PhotoMeta = {
    id,
    fileName,
    thumbFileName,
    cropFileName,
    quad: crop?.quad.map(([x, y]) => [x, y]) as PhotoMeta['quad'],
    mimeType,
    takenAt,
    createdAt: Date.now(),
    courseId: match?.courseId ?? '',
    capture: match ? 'auto' : 'none',
    note: '',
  };
  await putPhoto(meta);
  return meta;
}

/** 对已有照片重新裁剪：覆盖裁剪图（自动增强）并用新裁剪图重建缩略图 */
export async function updatePhotoCrop(photo: PhotoMeta, blob: Blob, quad: Quad): Promise<void> {
  const cropFileName = photo.cropFileName ?? `${photo.id}-crop.jpg`;
  const thumbFileName = photo.thumbFileName ?? `${photo.id}-thumb.jpg`;
  const enhanced = await enhanceDocumentImage(blob);
  await saveFile(cropFileName, enhanced);
  const bmp = await createImageBitmap(enhanced);
  const thumb = await makeThumbnail(bmp, bmp.width, bmp.height);
  bmp.close();
  await saveFile(thumbFileName, thumb);
  await putPhoto({
    ...photo,
    cropFileName,
    thumbFileName,
    quad: quad.map(([x, y]) => [x, y]) as PhotoMeta['quad'],
    backedUpAt: null, // 内容变了，不再是备份包里的那份，取消"已备份"标记以防被清理
  });
}

interface Props {
  queue: File[];
  index: number;
  onSave: (crop: { blob: Blob; quad: Quad } | null) => void;
  onAutoSaveRest: () => void;
  onCancel: () => void;
}

export default function CropEditor({ queue, index, onSave, onAutoSaveRest, onCancel }: Props) {
  const file = queue[index];
  const bitmapRef = useRef<ImageBitmap | null>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const dragCorner = useRef(-1);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [quad, setQuad] = useState<Quad | null>(null);
  const [status, setStatus] = useState<'loading' | 'detecting' | 'ready' | 'busy'>('loading');
  const [detected, setDetected] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setQuad(null);
    setSize({ w: 0, h: 0 });
    setStatus('loading');
    (async () => {
      let bmp: ImageBitmap;
      try {
        bmp = await createImageBitmap(file);
      } catch {
        if (!cancelled) alert('这张图片无法解码，已跳过');
        if (!cancelled) onSave(null);
        return;
      }
      if (cancelled) {
        bmp.close();
        return;
      }
      bitmapRef.current?.close();
      bitmapRef.current = bmp;
      setSize({ w: bmp.width, h: bmp.height });
      setStatus('detecting');
      const r = await detectQuad(bmp, bmp.width, bmp.height);
      if (cancelled) return;
      setQuad(r.quad);
      setDetected(r.engine === 'opencv');
      setStatus('ready');
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  // 绘制选区
  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas || !quad || !size.w) return;
    canvas.width = size.w;
    canvas.height = size.h;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const s = Math.max(size.w, size.h) / 1000;
    ctx.beginPath();
    quad.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = 'rgba(56,189,248,0.12)';
    ctx.fill();
    ctx.strokeStyle = '#0ea5e9';
    ctx.lineWidth = 3 * s;
    ctx.stroke();
    ctx.fillStyle = '#0ea5e9';
    for (const [x, y] of quad) {
      ctx.beginPath();
      ctx.arc(x, y, 12 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3 * s;
      ctx.stroke();
      ctx.fillStyle = '#0ea5e9';
    }
  }, [quad, size]);

  function eventPos(e: React.PointerEvent) {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    return [
      ((e.clientX - rect.left) / rect.width) * size.w,
      ((e.clientY - rect.top) / rect.height) * size.h,
    ] as [number, number];
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!quad) return;
    const [x, y] = eventPos(e);
    const s = Math.max(size.w, size.h) / 1000;
    let best = -1;
    let bestD = 40 * s;
    quad.forEach(([qx, qy], i) => {
      const d = Math.hypot(qx - x, qy - y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best >= 0) {
      dragCorner.current = best;
      (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (dragCorner.current < 0 || !quad) return;
    const [x, y] = eventPos(e);
    const next: Quad = quad.map((p, i) =>
      i === dragCorner.current
        ? [Math.min(Math.max(x, 0), size.w), Math.min(Math.max(y, 0), size.h)]
        : p,
    );
    setQuad(next);
  }

  function onPointerUp() {
    dragCorner.current = -1;
  }

  async function save() {
    if (!quad || !bitmapRef.current) return;
    setStatus('busy');
    const bmp = bitmapRef.current;
    const blob = await warpQuad(bmp, bmp.width, bmp.height, quad);
    onSave({ blob, quad });
  }

  async function redetect() {
    if (!bitmapRef.current) return;
    setStatus('detecting');
    const bmp = bitmapRef.current;
    const r = await detectQuad(bmp, bmp.width, bmp.height);
    setQuad(r.quad);
    setDetected(r.engine === 'opencv');
    setStatus('ready');
  }

  function resetQuad() {
    if (!size.w) return;
    setQuad([
      [0, 0],
      [size.w, 0],
      [size.w, size.h],
      [0, size.h],
    ]);
  }

  // 整体收缩/放大：自动框偏大（框到光晕/墙）或偏小时的不依赖算法的兜底，按住可连续移动
  const holdTimer = useRef<number | null>(null);

  function scaleBy(factor: number) {
    setQuad((q) => (q ? scaleQuad(q, factor, { w: size.w, h: size.h }) : q));
  }

  function startHold(factor: number) {
    stopHold();
    scaleBy(factor);
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = window.setInterval(() => scaleBy(factor), 90);
    }, 350);
  }

  function stopHold() {
    if (holdTimer.current != null) {
      clearTimeout(holdTimer.current);
      clearInterval(holdTimer.current);
      holdTimer.current = null;
    }
  }

  useEffect(() => stopHold, []);

  const remaining = queue.length - index - 1;
  const target = quad ? quadTargetSize(quad) : null;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm text-slate-500">
        <span>
          第 {index + 1}/{queue.length} 张 · {file.name}
        </span>
        <button onClick={onCancel} className="px-2 text-slate-400">
          全部取消
        </button>
      </div>

      <div className="relative w-full overflow-hidden rounded-lg bg-slate-900" style={{ aspectRatio: size.w ? `${size.w}/${size.h}` : '4/3' }}>
        {bitmapRef.current && size.w > 0 && (
          <>
            <img
              src={fileObjectUrl(file)}
              alt=""
              className="absolute inset-0 h-full w-full object-fill"
            />
            <canvas
              ref={overlayRef}
              className="absolute inset-0 h-full w-full touch-none"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            />
          </>
        )}
        {(status === 'loading' || status === 'detecting') && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-sm text-white">
            {status === 'loading' ? '解码中…' : '自动检测边缘…'}
          </div>
        )}
      </div>

      <p className="mt-2 text-xs text-slate-500">
        {status === 'detecting'
          ? '正在加载检测引擎（首次需加载 OpenCV WASM）…'
          : detected
            ? '已自动框出文档边缘，拖动蓝色角点微调'
            : quad
              ? '未能自动识别，已给默认选区，请拖动角点手动框选'
              : ''}
      </p>
      {target && <p className="mt-1 text-xs text-slate-400">裁剪后尺寸约 {target.w}×{target.h}</p>}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          disabled={status !== 'ready'}
          onClick={save}
          className="rounded-xl bg-slate-900 py-3 text-white disabled:opacity-40"
        >
          保存这张{remaining > 0 ? `（剩 ${remaining} 张）` : ''}
        </button>
        <button
          disabled={status === 'busy' || remaining === 0}
          onClick={onAutoSaveRest}
          className="rounded-xl border border-slate-300 bg-white py-3 disabled:opacity-40"
        >
          其余 {remaining} 张自动裁剪入库
        </button>
        <button
          disabled={status !== 'ready'}
          onPointerDown={() => startHold(0.96)}
          onPointerUp={stopHold}
          onPointerLeave={stopHold}
          onContextMenu={(e) => e.preventDefault()}
          className="touch-none select-none rounded-xl border border-slate-300 bg-white py-2 text-sm text-slate-600 disabled:opacity-40"
        >
          整体收缩（框到墙时按住）
        </button>
        <button
          disabled={status !== 'ready'}
          onPointerDown={() => startHold(1.04)}
          onPointerUp={stopHold}
          onPointerLeave={stopHold}
          onContextMenu={(e) => e.preventDefault()}
          className="touch-none select-none rounded-xl border border-slate-300 bg-white py-2 text-sm text-slate-600 disabled:opacity-40"
        >
          整体放大（裁掉内容时按住）
        </button>
        <button
          disabled={status !== 'ready'}
          onClick={redetect}
          className="rounded-xl border border-slate-300 bg-white py-2 text-sm text-slate-600 disabled:opacity-40"
        >
          重新自动检测
        </button>
        <button
          disabled={status !== 'ready'}
          onClick={resetQuad}
          className="rounded-xl border border-slate-300 bg-white py-2 text-sm text-slate-600 disabled:opacity-40"
        >
          选区还原为整图
        </button>
      </div>
    </div>
  );
}

// 供 <img> 显示的 objectURL 缓存（File → blob:）
const objectUrlCache = new Map<File, string>();
export function fileObjectUrl(file: File): string {
  let url = objectUrlCache.get(file);
  if (!url) {
    url = URL.createObjectURL(file);
    objectUrlCache.set(file, url);
  }
  return url;
}
