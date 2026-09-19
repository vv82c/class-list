import { readFile } from '../storage/opfs';
import type { AppSettings } from '../storage/db';
import type { Course, PhotoMeta } from '../types';

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

/** 文件系统非法字符清洗（目录名/文件名通用） */
export function sanitizeSegment(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/, '')
    .trim();
  return (cleaned || '未命名').slice(0, 60);
}

function fmtTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

const KINDS: { key: string; pick: (p: PhotoMeta) => string | undefined }[] = [
  { key: 'original', pick: (p) => (p.originalRemoved ? undefined : p.fileName) },
  { key: 'thumb', pick: (p) => p.thumbFileName },
  { key: 'crop', pick: (p) => p.cropFileName },
];

export interface PhotoExportEntry {
  /** OPFS 中的源文件名 */
  fileName: string;
  /** 导出目标相对路径：课程名/日期时间-种类.ext */
  relPath: string;
}

/** 生成导出计划：每张照片的可用文件 → 课程目录/时间命名，重名自动加序号 */
export function buildPhotoExportPlan(photos: PhotoMeta[], courses: Course[]): PhotoExportEntry[] {
  const used = new Set<string>();
  const out: PhotoExportEntry[] = [];
  for (const p of photos) {
    const course = courses.find((c) => c.id === p.courseId);
    const dirName = sanitizeSegment(course?.name ?? '未分类');
    const t = fmtTime(p.takenAt ?? p.createdAt);
    for (const k of KINDS) {
      const name = k.pick(p);
      if (!name) continue;
      const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : 'jpg';
      const base = `${t}-${k.key}`;
      let rel = `${dirName}/${base}.${ext}`;
      let n = 2;
      while (used.has(rel)) {
        rel = `${dirName}/${base}-${n}.${ext}`;
        n++;
      }
      used.add(rel);
      out.push({ fileName: name, relPath: rel });
    }
  }
  return out;
}

async function ensureDir(root: FileSystemDirectoryHandle, path: string): Promise<FileSystemDirectoryHandle> {
  let cur = root;
  for (const seg of path.split('/')) {
    if (!seg) continue;
    cur = await cur.getDirectoryHandle(seg, { create: true });
  }
  return cur;
}

export interface FolderExportSummary {
  folderName: string;
  files: number;
  skipped: number;
}

/**
 * 把 OPFS 里的全部图片复制成普通文件到用户选择的本地文件夹。
 * 说明：浏览器不允许网页打开 OPFS 的物理路径（沙箱设计），复制导出是
 * 在资源管理器里直接查看/使用这些文件的唯一方式。元数据另存为 JSON。
 */
export async function exportPhotosToFolder(
  photos: PhotoMeta[],
  courses: Course[],
  settings?: AppSettings,
): Promise<FolderExportSummary> {
  const w = window as unknown as {
    showDirectoryPicker?: (o?: { mode?: string }) => Promise<FileSystemDirectoryHandle>;
  };
  if (!w.showDirectoryPicker) {
    throw new Error('当前浏览器不支持选择本地文件夹，请使用 Chrome/Edge，或改用「导出完整备份」');
  }
  let target: FileSystemDirectoryHandle;
  try {
    target = await w.showDirectoryPicker({ mode: 'readwrite' });
  } catch (e) {
    if ((e as DOMException)?.name === 'AbortError') throw e; // 用户取消，静默
    throw new Error('未能获得文件夹访问权限');
  }
  const folderName = `课堂照片-${stamp()}`;
  const root = await target.getDirectoryHandle(folderName, { create: true });
  const plan = buildPhotoExportPlan(photos, courses);
  let files = 0;
  let skipped = 0;
  for (const e of plan) {
    const blob = await readFile(e.fileName);
    if (!blob) {
      skipped++;
      continue;
    }
    const segs = e.relPath.split('/');
    const dir = await ensureDir(root, segs.slice(0, -1).join('/'));
    const fh = await dir.getFileHandle(segs[segs.length - 1]!, { create: true });
    const wr = await fh.createWritable();
    await wr.write(blob);
    await wr.close();
    files++;
  }

  // 元数据：课表、学期设置、每张照片的归属与导出后文件路径对照
  const relByFile = new Map(plan.map((e) => [e.fileName, e.relPath]));
  const meta = {
    exportedAt: new Date().toISOString(),
    settings,
    courses,
    photos: photos.map((p) => ({
      id: p.id,
      courseId: p.courseId,
      takenAt: p.takenAt,
      capture: p.capture,
      starred: !!p.starred,
      note: p.note,
      files: {
        original: p.fileName ? relByFile.get(p.fileName) : undefined,
        thumb: p.thumbFileName ? relByFile.get(p.thumbFileName) : undefined,
        crop: p.cropFileName ? relByFile.get(p.cropFileName) : undefined,
      },
    })),
  };
  const mfh = await root.getFileHandle('元数据.json', { create: true });
  const mw = await mfh.createWritable();
  await mw.write(new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' }));
  await mw.close();

  return { folderName, files, skipped };
}
