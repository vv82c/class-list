import { useEffect, useRef, useState } from 'react';
import CropEditor, { persistPhoto } from '../components/CropEditor';
import { detectQuad, warpQuad, type Quad } from '../lib/crop';
import { Link } from 'react-router-dom';

const isImage = (f: File) => f.type.startsWith('image/');

/** 收集拖入的照片；优先走 entry API 以支持整个文件夹（readEntries 每批最多 100 条，须读到空为止） */
function filesFromDataTransfer(dt: DataTransfer): Promise<File[]> {
  const entries = Array.from(dt.items ?? [])
    .filter((it) => it.kind === 'file')
    .map((it) => it.webkitGetAsEntry())
    .filter((e): e is FileSystemEntry => e != null);
  if (!entries.length) return Promise.resolve(Array.from(dt.files).filter(isImage));

  const files: File[] = [];
  const walk = (entry: FileSystemEntry): Promise<void> =>
    new Promise((resolve) => {
      if (entry.isFile) {
        (entry as FileSystemFileEntry).file(
          (f) => {
            if (isImage(f)) files.push(f);
            resolve();
          },
          () => resolve(),
        );
      } else if (entry.isDirectory) {
        const reader = (entry as FileSystemDirectoryEntry).createReader();
        const readBatch = () =>
          reader.readEntries(
            async (batch) => {
              if (!batch.length) return resolve();
              for (const e of batch) await walk(e);
              readBatch();
            },
            () => resolve(),
          );
        readBatch();
      } else {
        resolve();
      }
    });
  return Promise.all(entries.map(walk)).then(() => files);
}

export default function CapturePage() {
  const pickRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement | null>(null);
  const dragDepth = useRef(0);
  const [queue, setQueue] = useState<File[]>([]);
  const [index, setIndex] = useState(0);
  const [message, setMessage] = useState('');
  const [batchBusy, setBatchBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  // 拖放落在页面其他区域时浏览器默认会直接打开图片顶掉应用，全局拦掉
  useEffect(() => {
    const prevent = (e: DragEvent) => e.preventDefault();
    window.addEventListener('dragover', prevent);
    window.addEventListener('drop', prevent);
    return () => {
      window.removeEventListener('dragover', prevent);
      window.removeEventListener('drop', prevent);
    };
  }, []);

  function pickFiles(files: File[]) {
    if (files.length === 0) return;
    setQueue(files);
    setIndex(0);
    setMessage('');
  }

  async function handleSaved(crop: { blob: Blob; quad: Quad } | null) {
    const file = queue[index];
    if (crop) {
      await persistPhoto(file, file.type || 'image/jpeg', crop);
    }
    advance(1, crop ? 1 : 0);
  }

  function advance(step: number, savedDelta: number) {
    setIndex((i) => {
      const next = i + step;
      if (next >= queue.length) {
        setMessage(`本批 ${queue.length} 张处理完成${savedDelta ? '' : ''}`);
        setQueue([]);
        return 0;
      }
      return next;
    });
  }

  /** 跳过编辑：对剩余全部照片跑自动检测并直接入库 */
  async function autoSaveRest() {
    setBatchBusy(true);
    let done = 0;
    for (let i = index + 1; i < queue.length; i++) {
      const file = queue[i];
      try {
        const bmp = await createImageBitmap(file);
        const { quad } = await detectQuad(bmp, bmp.width, bmp.height);
        const blob = await warpQuad(bmp, bmp.width, bmp.height, quad);
        bmp.close();
        await persistPhoto(file, file.type || 'image/jpeg', { blob, quad });
        done++;
      } catch {
        await persistPhoto(file, file.type || 'image/jpeg', null).catch(() => {});
      }
    }
    setBatchBusy(false);
    setMessage(`已自动裁剪入库 ${done} 张，可在归档页点开单张重新裁剪`);
    setQueue([]);
    setIndex(0);
  }

  if (queue.length > 0) {
    return (
      <div className="p-4">
        <h1 className="mb-3 text-xl font-bold">裁剪</h1>
        {batchBusy ? (
          <p className="text-sm text-slate-500">批量自动裁剪处理中…</p>
        ) : (
          <CropEditor
            queue={queue}
            index={index}
            onSave={handleSaved}
            onAutoSaveRest={autoSaveRest}
            onCancel={() => {
              setQueue([]);
              setIndex(0);
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div
      className="p-4"
      onDragEnter={(e) => {
        e.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => {
        dragDepth.current -= 1;
        if (dragDepth.current <= 0) {
          dragDepth.current = 0;
          setDragging(false);
        }
      }}
      onDrop={async (e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        const files = await filesFromDataTransfer(e.dataTransfer);
        if (files.length) pickFiles(files);
        else setMessage('拖入的内容里没有可导入的照片（只认图片文件）');
      }}
    >
      <h1 className="mb-1 text-xl font-bold">拍照采集</h1>
      <p className="mb-4 text-sm text-slate-500">
        手机拍的照片拷到电脑后在这里导入：按 EXIF 拍摄时间自动归课，自动框边后可拖角微调或用「整体收缩 /
        放大」兜底。注意微信以「图片」方式发送会剥掉拍摄时间，请用数据线或「文件」方式传。
      </p>
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => pickRef.current?.click()}
          className="rounded-xl bg-slate-900 py-4 text-white"
        >
          🖼 选择照片
        </button>
        <button
          onClick={() => folderRef.current?.click()}
          className="rounded-xl border border-slate-300 bg-white py-4"
        >
          📁 导入整个文件夹
        </button>
      </div>
      <p className="mt-3 text-xs text-slate-400">也可以把照片或整个文件夹直接拖进本页</p>

      <input
        ref={pickRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          pickFiles(Array.from(e.target.files ?? []).filter(isImage));
          e.target.value = '';
        }}
      />
      <input
        ref={(el) => {
          folderRef.current = el;
          // React 不透传 webkitdirectory，手动补上（文件夹导入需要）
          if (el) {
            el.setAttribute('webkitdirectory', '');
            el.setAttribute('directory', '');
          }
        }}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          pickFiles(Array.from(e.target.files ?? []).filter(isImage));
          e.target.value = '';
        }}
      />
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-sky-600/20">
          <p className="rounded-xl bg-white px-6 py-4 text-lg font-semibold text-sky-700 shadow-lg">
            松开导入照片
          </p>
        </div>
      )}
      {message && (
        <p className="mt-4 text-sm text-emerald-600">
          {message}
          <Link to="/archive" className="ml-2 text-sky-600 underline">去归档页查看</Link>
        </p>
      )}
    </div>
  );
}
