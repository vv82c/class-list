import { canvasToBlob } from './crop';

/**
 * 通道级自动色阶：按分位截断做线性拉伸。
 * 投影偏色（纸面不白）会被拉回中性白，字与底的反差同时拉开。
 * 某通道明暗过平（span < 16）或已近全范围时跳过，避免噪声被炸开。
 */
export function autoLevels(data: Uint8ClampedArray, cutRatio = 0.005): void {
  const total = data.length / 4;
  if (!total) return;
  const cut = Math.max(1, Math.round(total * cutRatio));
  const hists = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  for (let i = 0; i < data.length; i += 4) {
    hists[0][data[i]]++;
    hists[1][data[i + 1]]++;
    hists[2][data[i + 2]]++;
  }
  for (let c = 0; c < 3; c++) {
    const hist = hists[c];
    let lo = 0;
    let hi = 255;
    let acc = 0;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= cut) {
        lo = v;
        break;
      }
    }
    acc = 0;
    for (let v = 255; v >= 0; v--) {
      acc += hist[v];
      if (acc >= cut) {
        hi = v;
        break;
      }
    }
    const span = hi - lo;
    if (span < 16 || span > 250) continue;
    const lut = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) lut[v] = Math.round(((v - lo) / span) * 255);
    for (let i = c; i < data.length; i += 4) data[i] = lut[data[i]];
  }
}

/**
 * 轻量 USM 锐化：3×3 盒模糊（水平+垂直两趟可分离）作模糊副本，
 * 输出 = 原图 + amount × (原图 − 模糊)。只处理 RGB。
 */
export function unsharpMask(data: Uint8ClampedArray, w: number, h: number, amount = 0.35): void {
  if (w < 3 || h < 3) return;
  const src = new Uint8ClampedArray(data);
  const blur = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      const i = row + x * 4;
      const l = x > 0 ? i - 4 : i;
      const r = x < w - 1 ? i + 4 : i;
      blur[i] = (src[l] + src[i] + src[r]) / 3;
      blur[i + 1] = (src[l + 1] + src[i + 1] + src[r + 1]) / 3;
      blur[i + 2] = (src[l + 2] + src[i + 2] + src[r + 2]) / 3;
    }
  }
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    const up = y > 0 ? row - w * 4 : row;
    const dn = y < h - 1 ? row + w * 4 : row;
    for (let x = 0; x < w; x++) {
      const i = row + x * 4;
      const iu = up + x * 4;
      const id = dn + x * 4;
      for (let c = 0; c < 3; c++) {
        const b = (blur[iu + c] + blur[i + c] + blur[id + c]) / 3;
        data[i + c] = src[i + c] + amount * (src[i + c] - b);
      }
    }
  }
}

/**
 * 文档图增强：自动色阶 + 轻锐化，让投影偏色归白、小字更清楚。
 * 只作用于裁剪图（原图永远保留可切回）；任何一步失败都原样返回。
 */
export async function enhanceDocumentImage(blob: Blob): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bmp, 0, 0);
    bmp.close();
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    autoLevels(img.data);
    unsharpMask(img.data, canvas.width, canvas.height);
    ctx.putImageData(img, 0, 0);
    return await canvasToBlob(canvas);
  } catch {
    return blob;
  }
}
