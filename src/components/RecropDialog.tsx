import { useEffect, useState } from 'react';
import CropEditor, { updatePhotoCrop } from './CropEditor';
import { readFile } from '../storage/opfs';
import type { PhotoMeta } from '../types';

interface Props {
  photo: PhotoMeta;
  onClose: () => void;
  onSaved: () => void;
}

/** 对已入库照片重新框选裁剪（自动检测不靠谱时的兜底入口） */
export default function RecropDialog({ photo, onClose, onSaved }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let dead = false;
    readFile(photo.fileName).then((blob) => {
      if (dead) return;
      if (!blob) {
        setError('原图已清理，无法重新裁剪');
        return;
      }
      setFile(new File([blob], photo.fileName, { type: photo.mimeType }));
    });
    return () => {
      dead = true;
    };
  }, [photo]);

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-slate-50 p-4">
      <div className="mx-auto max-w-lg">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">重新裁剪</h2>
          <button onClick={onClose} className="rounded-lg px-3 py-1 text-sm text-slate-500 ring-1 ring-slate-300">
            取消
          </button>
        </div>
        {error ? (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
        ) : !file ? (
          <p className="text-sm text-slate-400">载入原图…</p>
        ) : (
          <CropEditor
            queue={[file]}
            index={0}
            onSave={async (crop) => {
              if (crop) {
                await updatePhotoCrop(photo, crop.blob, crop.quad);
                onSaved();
              }
              onClose();
            }}
            onAutoSaveRest={() => onClose()}
            onCancel={onClose}
          />
        )}
      </div>
    </div>
  );
}
