import { useEffect, useState } from 'react';
import { downloadBlob, exportBundle, importBundle, type ExportSummary, type ImportSummary } from '../lib/backup';
import { exportPhotosToFolder } from '../lib/photoFolder';
import {
  cacheStats,
  clearRuntimeCaches,
  courseCleanupPlan,
  findOrphans,
  unregisterServiceWorkers,
  wipeAllData,
  type CacheStat,
} from '../lib/cleanup';
import { deleteFile } from '../storage/opfs';
import { deletePhoto, getCourses, getPhotos, getSettings, putPhoto } from '../storage/db';
import type { Course, PhotoMeta } from '../types';

function human(bytes: number): string {
  if (bytes > 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

export default function SyncPage() {
  const [photos, setPhotos] = useState<PhotoMeta[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [semesterStart, setSemesterStart] = useState<string | null>(null);
  const [cacheList, setCacheList] = useState<CacheStat[] | null>(null);
  const [cleanupCourse, setCleanupCourse] = useState('');
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const reload = async () => {
    setPhotos(await getPhotos());
    setCourses(await getCourses());
    setSemesterStart((await getSettings()).semesterStart);
    const est = await navigator.storage?.estimate?.().catch(() => null);
    if (est) setUsage({ used: est.usage ?? 0, quota: est.quota ?? 0 });
    cacheStats()
      .then(setCacheList)
      .catch(() => setCacheList([]));
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

  async function onExportFolder() {
    setBusy('正在复制图片到所选文件夹…');
    setError('');
    setMessage('');
    try {
      const r = await exportPhotosToFolder(photos, courses ?? [], { semesterStart });
      setMessage(
        `已复制 ${r.files} 张图片到所选文件夹中的「${r.folderName}」——按课程分目录、文件名含拍摄时间，并附元数据.json（课表与归属对照）。${
          r.skipped ? `另有 ${r.skipped} 个文件缺失已跳过。` : ''
        }`,
      );
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') {
        setMessage('已取消，未复制任何文件。');
      } else {
        setError(`导出失败：${(e as Error).message}`);
      }
    } finally {
      setBusy('');
    }
  }

  async function onClearCaches() {
    setBusy('正在清除应用缓存…');
    setError('');
    setMessage('');
    try {
      const r = await clearRuntimeCaches();
      await reload();
      setMessage(
        r.names.length
          ? `已清除 ${r.names.length} 个运行时缓存（${human(r.bytes)}）：${r.names.join('、')}。预缓存保留，应用仍可离线打开；下次裁剪照片时会重新下载检测引擎。`
          : '没有可清除的运行时缓存。',
      );
    } catch (e) {
      setError(`清除失败：${(e as Error).message}`);
    } finally {
      setBusy('');
    }
  }

  async function onCleanOrphans() {
    setBusy('正在扫描孤儿文件…');
    setError('');
    setMessage('');
    try {
      const { listFiles, deleteFile: rm } = await import('../storage/opfs');
      const orphans = findOrphans(await listFiles(), photos);
      if (!orphans.length) {
        setMessage('没有孤儿文件：沙箱内所有文件都被照片记录正常引用。');
        return;
      }
      if (!confirm(`发现 ${orphans.length} 个未被任何照片记录引用的孤儿文件，删除后不可恢复。确定清理吗？`)) return;
      setBusy(`正在清理 ${orphans.length} 个孤儿文件…`);
      for (const f of orphans) await rm(f).catch(() => {});
      await reload();
      setMessage(`已清理 ${orphans.length} 个孤儿文件。`);
    } catch (e) {
      setError(`扫描失败：${(e as Error).message}`);
    } finally {
      setBusy('');
    }
  }

  async function onDeleteCoursePhotos() {
    if (!cleanupCourse) return;
    const plan = courseCleanupPlan(cleanupCourse, photos);
    if (!plan.length) {
      setMessage('该课程名下没有照片。');
      return;
    }
    const name = courses.find((c) => c.id === cleanupCourse)?.name ?? '该课程';
    if (
      !confirm(
        `将删除「${name}」名下 ${plan.length} 张照片（图片文件与记录一并删除），此操作不可恢复。\n\n若尚未备份，请先导出完整备份包。确定删除吗？`,
      )
    )
      return;
    setBusy(`正在删除 ${plan.length} 张照片…`);
    setError('');
    setMessage('');
    try {
      for (const p of plan) await deletePhoto(p);
      setCleanupCourse('');
      await reload();
      setMessage(`已删除「${name}」名下 ${plan.length} 张照片。`);
    } catch (e) {
      setError(`删除失败：${(e as Error).message}`);
    } finally {
      setBusy('');
    }
  }

  async function onWipeAll() {
    const unbackup = photos.filter((p) => !p.backedUpAt && !p.originalRemoved).length;
    const first = `将清空本应用的全部数据：${courses.length} 门课程、${photos.length} 张照片的记录与全部图片文件。\n\n此操作不可恢复，完整备份包是唯一恢复手段。${
      unbackup > 0 ? `\n\n⚠ 警告：其中 ${unbackup} 张照片尚未包含在任何备份中！` : ''
    }\n\n确定要继续吗？`;
    if (!confirm(first)) return;
    if (prompt('这是最后一步：请输入"清空"两个字以确认（复制粘贴无效请手动输入）') !== '清空') {
      setMessage('已取消，数据未动。');
      return;
    }
    setBusy('正在清空全部数据…');
    setError('');
    setMessage('');
    try {
      const r = await wipeAllData();
      const withSw = confirm(
        `已删除 ${r.files} 个文件并清空数据库。\n\n是否同时注销 Service Worker 并清除离线缓存？（彻底移除应用痕迹，下次打开需重新下载应用）`,
      );
      if (withSw) {
        await unregisterServiceWorkers();
        for (const name of await caches.keys()) await caches.delete(name);
      }
      location.reload();
    } catch (e) {
      setError(`清空失败：${(e as Error).message}`);
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
        <button
          disabled={!!busy || photos.length === 0}
          onClick={onExportFolder}
          title="数据本体在浏览器沙箱中无法直接打开物理路径；此操作把全部图片复制成普通文件（按课程分目录），附元数据"
          className="w-full rounded-xl border border-slate-300 bg-white py-3 disabled:opacity-40"
        >
          把图片复制到本地文件夹（按课程分目录）
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

      <div className="mt-6 rounded-xl bg-white p-3 ring-1 ring-slate-200">
        <h2 className="text-sm font-semibold text-slate-700">清理</h2>
        <p className="mt-1 text-xs text-slate-400">
          缓存与数据严格分离：缓存清理无损，数据清理不可恢复。占用：照片数据约{' '}
          {usage && cacheList
            ? human(Math.max(0, usage.used - cacheList.reduce((s, c) => s + c.bytes, 0)))
            : '…'}
          ，应用缓存{' '}
          {cacheList ? human(cacheList.reduce((s, c) => s + c.bytes, 0)) : '…'}
          {cacheList?.length ? `（${cacheList.map((c) => `${c.name === 'opencv-wasm' ? '检测引擎' : c.name.startsWith('workbox-precache') ? '应用壳' : c.name} ${human(c.bytes)}`).join('、')}）` : ''}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
          <button
            disabled={!!busy}
            onClick={onClearCaches}
            className="rounded-lg border border-slate-300 bg-white py-2 text-slate-600 disabled:opacity-40"
          >
            清除应用缓存（无损）
          </button>
          <button
            disabled={!!busy}
            onClick={onCleanOrphans}
            className="rounded-lg border border-slate-300 bg-white py-2 text-slate-600 disabled:opacity-40"
          >
            清理孤儿文件
          </button>
        </div>
        <div className="mt-2 flex gap-2">
          <select
            value={cleanupCourse}
            onChange={(e) => setCleanupCourse(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm"
          >
            <option value="">选择要清空照片的课程…</option>
            {courses.map((c) => {
              const n = courseCleanupPlan(c.id, photos).length;
              return (
                <option key={c.id} value={c.id}>
                  {c.name}（{n} 张）
                </option>
              );
            })}
          </select>
          <button
            disabled={!!busy || !cleanupCourse}
            onClick={onDeleteCoursePhotos}
            className="rounded-lg border border-red-200 bg-white px-3 py-2 text-red-600 disabled:opacity-40"
          >
            删除该课照片
          </button>
        </div>
        <button
          disabled={!!busy || photos.length === 0}
          onClick={onWipeAll}
          className="mt-2 w-full rounded-lg border border-red-300 bg-red-50 py-2 text-sm font-medium text-red-700 disabled:opacity-40"
        >
          清空全部数据（课程 + 照片 + 图片文件）
        </button>
        <p className="mt-1.5 text-xs text-slate-400">
          清空为两级确认（需输入"清空"）；学期设置会一并清掉，重新使用时需到课表页重设。
        </p>
      </div>
    </div>
  );
}
