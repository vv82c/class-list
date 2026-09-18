import { useEffect, useState } from 'react';
import { readFile } from '../storage/opfs';

export function usePhotoUrl(fileName: string | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;
    setUrl(null);
    if (!fileName) return;
    readFile(fileName).then((file) => {
      if (!file || revoked) return;
      objectUrl = URL.createObjectURL(file);
      setUrl(objectUrl);
    });
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileName]);
  return url;
}

export function formatTime(ms: number | null): string {
  if (ms == null) return '时间未知';
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
