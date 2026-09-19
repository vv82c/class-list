async function getRoot() {
  return navigator.storage.getDirectory();
}

export async function saveFile(name: string, data: Blob): Promise<void> {
  const root = await getRoot();
  const handle = await root.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(data);
  await writable.close();
}

export async function readFile(name: string): Promise<File | null> {
  try {
    const root = await getRoot();
    const handle = await root.getFileHandle(name);
    return await handle.getFile();
  } catch {
    return null;
  }
}

export async function deleteFile(name: string): Promise<void> {
  const root = await getRoot();
  await root.removeEntry(name);
}

/** 列出沙箱内全部文件名 */
export async function listFiles(): Promise<string[]> {
  const root = await getRoot();
  const out: string[] = [];
  // TS 的 DOM 类型尚未收录 OPFS 的异步迭代器（entries），运行时 Chrome/Edge 支持
  const iter = (root as unknown as { entries: () => AsyncIterableIterator<[string, unknown]> }).entries();
  for await (const [name] of iter) out.push(name);
  return out;
}

/** 清空全部文件（清空数据用），返回清理数量 */
export async function clearAllFiles(): Promise<number> {
  const names = await listFiles();
  const root = await getRoot();
  for (const n of names) await root.removeEntry(n).catch(() => {});
  return names.length;
}
