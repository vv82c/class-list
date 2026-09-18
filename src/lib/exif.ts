const EXIF_DATETIME_TAGS = new Set([0x0132, 0x9003, 0x9004]); // DateTime / Original / Digitized

/**
 * 从 JPEG/PNG 二进制中提取 EXIF 拍摄时间。
 * 只解析 ASCII 的 "YYYY:MM:DD HH:MM:SS"，取所有候选标签中最早的一个（优先 DateTimeOriginal）。
 */
export async function extractExifDateTime(blob: Blob): Promise<number | null> {
  const buf = await blob.slice(0, 256 * 1024).arrayBuffer();
  const bytes = new Uint8Array(buf);
  const exifStart = findExifSegment(bytes);
  if (exifStart < 0) return null;
  try {
    // bytes 是 blob 切片的完整 buffer，exifStart 已含切片位移
    const tiff = new DataView(buf, bytes.byteOffset + exifStart);
    return parseTiff(tiff) ?? null;
  } catch {
    return null;
  }
}

function findExifSegment(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset);
  const isJpeg = view.getUint16(0) === 0xffd8;
  const isPng = view.getUint32(0) === 0x89504e47;
  if (isJpeg) {
    let p = 2;
    while (p + 4 <= bytes.length) {
      if (bytes[p] !== 0xff) {
        p++;
        continue;
      }
      const marker = bytes[p + 1];
      if (marker === 0xda || marker === 0xd9) break; // SOS/EOI，EXIF 只会出现在更前
      const len = view.getUint16(p + 2);
      if (marker === 0xe1 && view.getUint32(p + 4) === 0x45786966) return p + 10; // FF E1(p)|len(p+2)|"Exif"(p+4)|\0\0(p+8)|TIFF(p+10)
      p += 2 + len;
    }
    return -1;
  }
  if (isPng) {
    const needle = [0x65, 0x58, 0x69, 0x66]; // "eXIf"
    let p = 8;
    while (p + 8 <= bytes.length) {
      const len = new DataView(bytes.buffer, bytes.byteOffset).getUint32(p);
      let match = true;
      for (let i = 0; i < 4; i++) if (bytes[p + 4 + i] !== needle[i]) match = false;
      if (match) return p + 8;
      p += 12 + len;
    }
  }
  return -1;
}

function parseTiff(view: DataView): number | null {
  const tiffBase = view.byteOffset;
  const ab = view.buffer;
  const little = new DataView(ab, tiffBase).getUint16(0) === 0x4949;
  const u16 = (o: number) => new DataView(ab, tiffBase).getUint16(o, little);
  const u32 = (o: number) => new DataView(ab, tiffBase).getUint32(o, little);
  if (u16(2) !== 0x002a) return null;

  const candidates: number[] = [];
  const readDir = (offset: number, depth: number) => {
    if (offset <= 0 || offset + 2 > view.byteLength || depth > 2) return;
    const count = u16(offset);
    for (let i = 0; i < count; i++) {
      const entry = offset + 2 + i * 12;
      const tag = u16(entry);
      const type = u16(entry + 2);
      const len = u32(entry + 4);
      if (type === 2 && EXIF_DATETIME_TAGS.has(tag) && len >= 19) {
        const valueOffset = len <= 4 ? entry + 8 : u32(entry + 8);
        let s = '';
        for (let j = 0; j < 19; j++) s += String.fromCharCode(new Uint8Array(ab, tiffBase + valueOffset + j)[0]);
        const m = s.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
        if (m) {
          // 相机时钟是本地时间，按本地时区构造（Date.parse 无时区串会按 UTC）
          const t = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
          if (!Number.isNaN(t)) candidates.push(t);
        }
      }
    }
    if (depth === 0) {
      const nextIfd = u32(offset + 2 + count * 12);
      if (nextIfd > 0 && nextIfd + 2 < view.byteLength) readDir(nextIfd, 1);
    }
  };

  readDir(u32(4), 0);
  return candidates.length ? Math.min(...candidates) : null;
}
