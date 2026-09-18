import test from 'node:test';
import assert from 'node:assert/strict';
import { extractExifDateTime } from './exif';

/**
 * 构造带 EXIF DateTimeOriginal 的最小 JPEG（little-endian TIFF）。
 * 真实 JPEG 布局：FF D8 | FF E1 | len(2B) | "Exif"(4B) | 00 00 | TIFF...
 * 即绝对偏移：SOI 0-1，APP1 标记 2-3，len 4-5，"Exif" 6-9，NUL 10-11，TIFF 从 12 开始。
 */
export function buildJpegWithExif(dt: string): Blob {
  const tiff = new Uint8Array(88);
  const v = new DataView(tiff.buffer);
  tiff[0] = 0x49;
  tiff[1] = 0x49; // "II" 小端
  v.setUint16(2, 42, true);
  v.setUint32(4, 8, true); // IFD0 @ 8
  v.setUint16(8, 2, true); // 2 条
  v.setUint16(10, 0x0132, true); // DateTime
  v.setUint16(12, 2, true);
  v.setUint32(14, 20, true);
  v.setUint32(18, 62, true); // 值偏移（38-57 被子 IFD 占用）
  v.setUint16(22, 0x8769, true); // ExifIFD 指针
  v.setUint16(24, 4, true);
  v.setUint32(26, 1, true);
  v.setUint32(30, 38, true); // 子 IFD @ 38
  v.setUint32(34, 0, true); // next IFD = 0
  v.setUint16(38, 1, true); // 子 IFD 1 条
  v.setUint16(40, 0x9003, true); // DateTimeOriginal
  v.setUint16(42, 2, true);
  v.setUint32(44, 20, true);
  v.setUint32(48, 62, true);
  v.setUint16(52, 0, true); // 子 IFD next = 0
  for (let i = 0; i < 20; i++) tiff[62 + i] = i < dt.length ? dt.charCodeAt(i) : 0;

  const content = 6 + tiff.length; // "Exif\0\0"(6) + TIFF
  const jpeg = new Uint8Array(2 + 2 + 2 + content + 2);
  let p = 0;
  jpeg[p++] = 0xff;
  jpeg[p++] = 0xd8; // SOI
  jpeg[p++] = 0xff;
  jpeg[p++] = 0xe1; // APP1
  jpeg[p++] = (content + 2) >> 8;
  jpeg[p++] = (content + 2) & 0xff; // len 含自身
  jpeg[p++] = 0x45;
  jpeg[p++] = 0x78;
  jpeg[p++] = 0x69;
  jpeg[p++] = 0x66; // "Exif" @ 6-9
  jpeg[p++] = 0;
  jpeg[p++] = 0; // NUL @ 10-11
  jpeg.set(tiff, p); // TIFF @ 12
  jpeg[jpeg.length - 2] = 0xff;
  jpeg[jpeg.length - 1] = 0xd9; // EOI
  return new Blob([jpeg], { type: 'image/jpeg' });
}

test('提取 DateTimeOriginal', async () => {
  const ts = await extractExifDateTime(buildJpegWithExif('2026:09:18 10:30:00'));
  assert.equal(ts, new Date(2026, 8, 18, 10, 30, 0).getTime());
});

test('无 EXIF 返回 null', async () => {
  const blank = new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x00, 0xff, 0xd9]);
  assert.equal(await extractExifDateTime(new Blob([blank])), null);
});
