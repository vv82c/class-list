import JSZip from 'jszip';
import { getCourses, getPhotos, getSettings, putCourse, putPhoto, saveSettings, type AppSettings } from '../storage/db';
import { readFile, saveFile } from '../storage/opfs';
import type { Course, PhotoMeta } from '../types';

export const BUNDLE_VERSION = 2;

/** 建议每月备份一次，超过这个天数在页面上提醒 */
export const BACKUP_STALE_DAYS = 31;
const DAY_MS = 86_400_000;

export interface BackupAge {
  days: number | null; // 距上次导出的天数；从未导出为 null
  stale: boolean; // 从未导出或超过 BACKUP_STALE_DAYS 天
}

/** 备份新鲜度：完整包或「复制到文件夹」导出成功即视为一次有效备份 */
export function backupAge(lastBackupAt: number | null | undefined, now = Date.now()): BackupAge {
  if (lastBackupAt == null) return { days: null, stale: true };
  const days = Math.floor((now - lastBackupAt) / DAY_MS);
  return { days, stale: days > BACKUP_STALE_DAYS };
}

export interface ExportSummary {
  fileName: string;
  blob: Blob;
  photos: number;
  courses: number;
  skipped: number;
}

interface Manifest {
  version: number;
  mode: ExportMode;
  exportedAt: number;
  courses: Course[];
  photos: PhotoMeta[];
  settings?: AppSettings; // v2 起携带
}

export type ExportMode = 'full' | 'lite';

function filesOf(photo: PhotoMeta, mode: ExportMode): string[] {
  const list: string[] = [];
  if (mode === 'full' && photo.fileName && !photo.originalRemoved) list.push(photo.fileName);
  if (photo.cropFileName) list.push(photo.cropFileName);
  if (photo.thumbFileName) list.push(photo.thumbFileName);
  return list;
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

/**
 * 打包全部数据。full 含原图（完整备份，也用于跨设备迁移）；
 * lite 只含裁剪图与缩略图（体积小得多，适合把浏览用的副本搬到电脑）。
 */
export async function exportBundle(mode: ExportMode): Promise<ExportSummary> {
  const [courses, photos] = await Promise.all([getCourses(), getPhotos()]);
  const zip = new JSZip();
  const included = new Set<string>();
  let skipped = 0;

  for (const photo of photos) {
    for (const name of filesOf(photo, mode)) {
      const blob = await readFile(name);
      if (!blob) {
        skipped++;
        continue;
      }
      zip.file(`files/${name}`, blob);
      included.add(photo.id);
    }
  }

  const manifest: Manifest = {
    version: BUNDLE_VERSION,
    mode,
    exportedAt: Date.now(),
    courses,
    photos: photos.map((p) => ({
      ...p,
      backedUpAt: mode === 'full' ? Date.now() : p.backedUpAt ?? null,
    })),
    // 备份包只携带学期配置；lastBackupAt 是本机提醒状态，不随包迁移
    settings: { semesterStart: (await getSettings()).semesterStart },
  };
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE', streamFiles: true });
  if (mode === 'full') {
    for (const photo of photos) await putPhoto({ ...photo, backedUpAt: Date.now() });
  }

  return {
    fileName: `课堂归档-${mode}-${stamp()}.zip`,
    blob,
    photos: included.size,
    courses: courses.length,
    skipped,
  };
}

export interface ImportSummary {
  coursesAdded: number;
  coursesUpdated: number;
  photosAdded: number;
  photosSkipped: number;
  filesRestored: number;
  filesMissing: number;
  mode: ExportMode;
  exportedAt: number;
}

/** 导入备份包：按 id 去重，本地已有的记录保留本地版本（本地为准） */
export async function importBundle(file: Blob): Promise<ImportSummary> {
  const zip = await JSZip.loadAsync(file);
  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) throw new Error('这个文件不是课堂归档的备份包（缺 manifest.json）');

  const manifest = JSON.parse(await manifestFile.async('string')) as Manifest;
  if (manifest.version > BUNDLE_VERSION) throw new Error('备份包版本更新，请升级应用后再导入');
  if (manifest.settings) await saveSettings({ semesterStart: manifest.settings.semesterStart });
  const summary: ImportSummary = {
    coursesAdded: 0,
    coursesUpdated: 0,
    photosAdded: 0,
    photosSkipped: 0,
    filesRestored: 0,
    filesMissing: 0,
    mode: manifest.mode,
    exportedAt: manifest.exportedAt,
  };

  const existingCourses = new Map((await getCourses()).map((c) => [c.id, c]));
  for (const course of manifest.courses) {
    const local = existingCourses.get(course.id);
    if (!local) {
      await putCourse(course);
      summary.coursesAdded++;
    } else if (course.slots.length > local.slots.length) {
      await putCourse(course); // 本地缺时间槽时补齐，保证自动归课能工作
      summary.coursesUpdated++;
    }
  }

  const existingPhotos = new Map((await getPhotos()).map((p) => [p.id, p]));
  for (const photo of manifest.photos) {
    if (existingPhotos.has(photo.id)) {
      summary.photosSkipped++;
      continue;
    }
    for (const name of filesOf(photo, manifest.mode)) {
      const entry = zip.file(`files/${name}`);
      if (!entry) {
        summary.filesMissing++;
        continue;
      }
      const blob = await entry.async('blob');
      await saveFile(name, blob);
      summary.filesRestored++;
    }
    // 精简包不含原图，落到本地后原图确实不存在，标记以免后续误当完整备份清理
    const stored: PhotoMeta =
      manifest.mode === 'lite' ? { ...photo, originalRemoved: true } : photo;
    await putPhoto(stored);
    summary.photosAdded++;
  }

  return summary;
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
