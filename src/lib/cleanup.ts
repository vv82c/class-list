import { clearAllFiles } from '../storage/opfs';
import type { PhotoMeta } from '../types';

/** 一条照片记录引用的全部文件名 */
export function referencedFiles(p: PhotoMeta): string[] {
  return [p.fileName, p.thumbFileName, p.cropFileName].filter((f): f is string => !!f);
}

/** 孤儿文件比对：OPFS 里存在、但没有被任何照片记录引用的文件 */
export function findOrphans(entries: string[], photos: PhotoMeta[]): string[] {
  const ref = new Set(photos.flatMap(referencedFiles));
  return entries.filter((e) => !ref.has(e));
}

/** 某课程名下待删除的照片记录 */
export function courseCleanupPlan(courseId: string, photos: PhotoMeta[]): PhotoMeta[] {
  return photos.filter((p) => p.courseId === courseId);
}

/** localStorage 里属于本应用的进度键 */
export function progressKeys(all: string[]): string[] {
  return all.filter((k) => k.startsWith('classlist:lastview:'));
}

export interface CacheStat {
  name: string;
  bytes: number;
}

/** 逐个缓存统计大小（点击时才跑，量不大） */
export async function cacheStats(): Promise<CacheStat[]> {
  if (!('caches' in window)) return [];
  const out: CacheStat[] = [];
  for (const name of await caches.keys()) {
    const cache = await caches.open(name);
    let bytes = 0;
    for (const req of await cache.keys()) {
      const res = await cache.match(req);
      if (!res) continue;
      bytes += (await res.arrayBuffer()).byteLength;
    }
    out.push({ name, bytes });
  }
  return out;
}

const PRECACHE_RE = /^workbox-precache/;

/** 清除运行时缓存（如 OpenCV WASM）；预缓存保留，应用仍可离线打开 */
export async function clearRuntimeCaches(): Promise<{ names: string[]; bytes: number }> {
  if (!('caches' in window)) return { names: [], bytes: 0 };
  const stats = await cacheStats();
  const targets = stats.filter((s) => !PRECACHE_RE.test(s.name));
  for (const t of targets) await caches.delete(t.name);
  return { names: targets.map((t) => t.name), bytes: targets.reduce((s, t) => s + t.bytes, 0) };
}

/** 注销全部 Service Worker（清空数据的可选附加项） */
export async function unregisterServiceWorkers(): Promise<number> {
  if (!('serviceWorker' in navigator)) return 0;
  const regs = await navigator.serviceWorker.getRegistrations();
  for (const r of regs) await r.unregister();
  return regs.length;
}

/** 清空全部应用数据：OPFS 文件 + 整个 class-list 数据库 + 本应用进度键 */
export async function wipeAllData(): Promise<{ files: number }> {
  const files = await clearAllFiles();
  await new Promise((res) => {
    const req = indexedDB.deleteDatabase('class-list');
    req.onsuccess = req.onerror = req.onblocked = res;
  });
  for (const k of progressKeys(Object.keys(localStorage))) localStorage.removeItem(k);
  return { files };
}
