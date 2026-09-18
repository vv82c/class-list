import { useRef, useState } from 'react';
import CropEditor, { persistPhoto } from '../components/CropEditor';
import { detectQuad, warpQuad, type Quad } from '../lib/crop';
import { Link } from 'react-router-dom';

export default function CapturePage() {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<File[]>([]);
  const [index, setIndex] = useState(0);
  const [message, setMessage] = useState('');
  const [batchBusy, setBatchBusy] = useState(false);

  function pickFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setQueue(Array.from(files));
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

  const input = (ref: typeof cameraRef, accept: string, capture?: 'environment') => (
    <input
      ref={ref}
      type="file"
      accept={accept}
      capture={capture}
      multiple
      className="hidden"
      onChange={(e) => {
        pickFiles(e.target.files);
        e.target.value = '';
      }}
    />
  );

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
    <div className="p-4">
      <h1 className="mb-1 text-xl font-bold">拍照</h1>
      <p className="mb-4 text-sm text-slate-500">
        导入后进入裁剪：自动检测 PPT/黑板边缘，可拖角点微调；按 EXIF 时间入库（M4 起自动归课）
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => cameraRef.current?.click()}
          className="flex-1 rounded-xl bg-slate-900 py-4 text-white"
        >
          📷 相机拍照
        </button>
        <button
          onClick={() => galleryRef.current?.click()}
          className="flex-1 rounded-xl border border-slate-300 bg-white py-4"
        >
          🖼 从相册导入
        </button>
      </div>
      {input(cameraRef, 'image/*', 'environment')}
      {input(galleryRef, 'image/*')}
      {message && (
        <p className="mt-4 text-sm text-emerald-600">
          {message}
          <Link to="/archive" className="ml-2 text-sky-600 underline">去归档页查看</Link>
        </p>
      )}
    </div>
  );
}
