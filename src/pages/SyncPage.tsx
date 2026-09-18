import { useEffect, useState } from 'react';
import { downloadBlob, exportBundle, importBundle, type ExportSummary, type ImportSummary } from '../lib/backup';
import { deleteFile } from '../storage/opfs';
import { getPhotos, putPhoto } from '../storage/db';
import type { PhotoMeta } from '../types';

function human(bytes: number): string {
  if (bytes > 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

export default function SyncPage() {
  const [photos, setPhotos] = useState<PhotoMeta[]>([]);
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const reload = async () => {
    setPhotos(await getPhotos());
    const est = await navigator.storage?.estimate?.().catch(() => null);
    if (est) setUsage({ used: est.usage ?? 0, quota: est.quota ?? 0 });
  };
  useEffect(() => {
    reload();
  }, []);

  const pending = photos.filter((p) => !p.backedUpAt && !p.originalRemoved).length;
  const cleanable = photos.filter(
    (p) => p.backedUpAt && !p.originalRemoved && p.fileName && !!(p.thumbFileName || p.cropFileName),
  );

  async function onExport(mode: 'full' | 'lite') {
    setBusy(mode === 'full' ? '正在打包完整备份…' : '正在打包精简包…');
    setError('');
    setMessage('');
    try {
      const result: ExportSummary = await exportBundle(mode);
      downloadBlob(result.blob, result.fileName);
      setMessage(
        `已生成 ${result.fileName}（${human(result.blob.size)}，含 ${result.photos} 张照片${
          result.skipped ? `，${result.skipped} 个文件读取失败已跳过` : ''
        }）。请把它存到网盘/移动硬盘等异地位置；恢复数据或搬到其他电脑时，仍在本页「导入」。`,
      );
      await reload();
    } catch (e) {
      setError(`导出失败：${(e as Error).message}`);
    } finally {
      setBusy('');
    }
  }

  async function onImport(file: File | undefined) {
    if (!file) return;
    setBusy('正在导入并写入本地存储…');
    setError('');
    setMessage('');
    try {
      const r: ImportSummary = await importBundle(file);
      setMessage(
        `导入完成：新增 ${r.photosAdded} 张照片、${r.coursesAdded} 门课程${
          r.coursesUpdated ? `（补齐 ${r.coursesUpdated} 门的时间槽）` : ''
        }，跳过已存在 ${r.photosSkipped} 张，还原 ${r.filesRestored} 个文件${
          r.filesMissing ? `，缺失 ${r.filesMissing} 个` : ''
        }。来源是${r.mode === 'lite' ? '精简' : '完整'}包。`,
      );
      await reload();
    } catch (e) {
      setError(`导入失败：${(e as Error).message}`);
    } finally {
      setBusy('');
    }
  }

  async function onClean() {
    if (!cleanable.length) return;
    if (
      !confirm(
        `将删除 ${cleanable.length} 张照片的“原图”以释放空间，保留裁剪图和缩略图（仍可正常浏览）。\n\n前提：你已经导出过完整备份包并把它存到了安全位置。若手头没有有效备份，取消并先导出。`,
      )
    )
      return;
    setBusy('正在清理已备份的原图…');
    for (const photo of cleanable) {
      await deleteFile(photo.fileName).catch(() => {});
      await putPhoto({ ...photo, originalRemoved: true });
    }
    setBusy('');
    setMessage(`已清理 ${cleanable.length} 张原图，裁剪图与缩略图保留。`);
    await reload();
  }

  return (
    <div className="p-4">
      <h1 className="mb-1 text-xl font-bold">备份</h1>
      <p className="mb-4 text-sm text-slate-500">
        数据只存在这台电脑的浏览器里。导出完整备份包并存到网盘/移动硬盘，是数据唯一的异地副本——建议每月一次。
      </p>

      <div className="mb-4 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
          <p className="text-slate-400">照片总数</p>
          <p className="text-lg font-semibold">{photos.length}</p>
        </div>
        <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
          <p className="text-slate-400">占用 / 可用</p>
          <p className="text-lg font-semibold">
            {usage ? `${human(usage.used)} / ${human(usage.quota)}` : '—'}
          </p>
        </div>
        <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
          <p className="text-slate-400">未备份</p>
          <p className={`text-lg font-semibold ${pending ? 'text-amber-600' : 'text-emerald-600'}`}>
            {pending}
          </p>
        </div>
        <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
          <p className="text-slate-400">可清理原图</p>
          <p className="text-lg font-semibold">{cleanable.length}</p>
        </div>
      </div>

      <div className="space-y-2">
        <button
          disabled={!!busy}
          onClick={() => onExport('full')}
          className="w-full rounded-xl bg-slate-900 py-3 text-white disabled:opacity-40"
        >
          {busy || '导出完整备份（含原图）'}
        </button>
        <button
          disabled={!!busy}
          onClick={() => onExport('lite')}
          className="w-full rounded-xl border border-slate-300 bg-white py-3 disabled:opacity-40"
        >
          导出精简包（仅裁剪图，体积小很多）
        </button>
        <label className="block w-full rounded-xl border border-slate-300 bg-white py-3 text-center">
          导入备份包
          <input
            type="file"
            accept="application/zip,.zip"
            className="hidden"
            onChange={(e) => {
              onImport(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
        {cleanable.length > 0 && (
          <button
            disabled={!!busy}
            onClick={onClean}
            className="w-full rounded-xl border border-red-200 bg-white py-3 text-red-600 disabled:opacity-40"
          >
            清理 {cleanable.length} 张已备份的原图（保留裁剪图）
          </button>
        )}
      </div>

      {message && (
        <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>
      )}
      {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <p className="mt-4 text-xs leading-relaxed text-slate-400">
        说明：完整备份含原图，是数据唯一的异地副本，建议每月导出一次并存到网盘/移动硬盘；
        清除浏览器站点数据或重装系统会清空本机数据，备份包是唯一的恢复手段。
      </p>
    </div>
  );
}
