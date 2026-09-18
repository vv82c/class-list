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
