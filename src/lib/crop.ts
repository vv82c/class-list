export type Quad = [number, number][]; // 顺序：左上、右上、右下、左下

export interface DetectResult {
  quad: Quad;
  engine: 'opencv' | 'fallback';
}

let cvPromise: Promise<any> | null = null;

function loadCV(): Promise<any> {
  if (!cvPromise) {
    cvPromise = (async () => {
      // Vite 把该 UMD 包按 CJS 处理：exports.default 是 Emscripten 就绪 Promise，
      // await 后才是带 Mat 等接口的实例
      const m: any = await import('@techstark/opencv-js');
      let cv: any = m?.default ?? m;
      if (cv && typeof cv.then === 'function') cv = await cv;
      if (!cv || !cv.Mat) throw new Error('OpenCV WASM 初始化失败');
      return cv;
    })().catch((err) => {
      cvPromise = null;
      throw err;
    });
  }
  return cvPromise;
}

function canvasFromSource(src: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(src, 0, 0, w, h);
  return canvas;
}

function imageDataFrom(canvas: HTMLCanvasElement): ImageData {
  return canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/jpeg', quality = 0.9): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), type, quality);
  });
}

/** 把任意顺序的 4 点整理为 左上/右上/右下/左下 */
function orderCorners(pts: Quad): Quad {
  const sum = pts.map(([x, y]) => x + y);
  const diff = pts.map(([x, y]) => x - y);
  return [
    pts[sum.indexOf(Math.min(...sum))],
    pts[diff.indexOf(Math.max(...diff))],
    pts[sum.indexOf(Math.max(...sum))],
    pts[diff.indexOf(Math.min(...diff))],
  ];
}

/** 在降采样图上跑 OpenCV 文档边缘检测，返回原图像素坐标的四角；失败返回内缩矩形 */
export async function detectQuad(source: CanvasImageSource, w: number, h: number): Promise<DetectResult> {
  const scale = Math.min(1, 800 / Math.max(w, h));
  const sw = Math.max(2, Math.round(w * scale));
  const sh = Math.max(2, Math.round(h * scale));
  try {
    const cv = await loadCV();
    const rgba = cv.matFromImageData(imageDataFrom(canvasFromSource(source, sw, sh)));
    const gray = new cv.Mat();
    const blur = new cv.Mat();
    const edges = new cv.Mat();
    const dilated = new cv.Mat();
    cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
    cv.Canny(blur, edges, 50, 150);
    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
    cv.dilate(edges, dilated, kernel);
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(dilated, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    const imgArea = sw * sh;
    let best: Quad | null = null;
    let bestArea = 0;
    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);
      if (area >= imgArea * 0.95) continue; // 整幅边框不算文档
      if (area < imgArea * 0.15) continue;
      const peri = cv.arcLength(cnt, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(cnt, approx, 0.03 * peri, true);
      if (approx.rows === 4 && cv.isContourConvex(approx)) {
        const pts: Quad = [];
        for (let j = 0; j < 4; j++) pts.push([approx.data32S[j * 2], approx.data32S[j * 2 + 1]]);
        if (area > bestArea) {
          best = orderCorners(pts);
          bestArea = area;
        }
      }
      approx.delete();
      cnt.delete();
    }
    rgba.delete();
    gray.delete();
    blur.delete();
    edges.delete();
    dilated.delete();
    kernel.delete();
    contours.delete();
    hierarchy.delete();

    if (best) {
      return { quad: best.map(([x, y]) => [x / scale, y / scale]) as Quad, engine: 'opencv' };
    }
  } catch (err) {
    console.warn('OpenCV 检测失败，回退手动选区', err);
  }
  const inset = 0.03;
  return {
    quad: [
      [w * inset, h * inset],
      [w * (1 - inset), h * inset],
      [w * (1 - inset), h * (1 - inset)],
      [w * inset, h * (1 - inset)],
    ],
    engine: 'fallback',
  };
}

const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** 按四角实测边长还原目标宽高，防止拉正后变形（Smart-Note-Scanner 思路） */
export function quadTargetSize(quad: Quad): { w: number; h: number } {
  const [tl, tr, br, bl] = quad;
  const w = Math.round(Math.max(dist(tl, tr), dist(bl, br)));
  const h = Math.round(Math.max(dist(tl, bl), dist(tr, br)));
  return { w: Math.max(2, w), h: Math.max(2, h) };
}

/** 透视校正：优先 OpenCV，不可用时纯 JS 单应回退 */
export async function warpQuad(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  quad: Quad,
): Promise<Blob> {
  const { w, h } = quadTargetSize(quad);
  try {
    const cv = await loadCV();
    const mat = cv.matFromImageData(imageDataFrom(canvasFromSource(source, srcW, srcH)));
    const srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, quad.flat());
    const dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, w, 0, w, h, 0, h]);
    const M = cv.getPerspectiveTransform(srcPts, dstPts);
    const out = new cv.Mat();
    cv.warpPerspective(mat, out, M, new cv.Size(w, h), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(255, 255, 255, 255));
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < rgba.length; i++) rgba[i] = out.data[i];
    mat.delete();
    srcPts.delete();
    dstPts.delete();
    M.delete();
    out.delete();
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.putImageData(new ImageData(rgba, w, h), 0, 0);
    return await canvasToBlob(canvas);
  } catch (err) {
    console.warn('OpenCV 校正失败，使用 JS 回退', err);
    return jsWarp(source, srcW, srcH, quad, w, h);
  }
}

/**
 * 纯 JS 回退：对 4 组对应点 (dst→src) 建 8×8 线性方程组，高斯消元求单应 H，
 * 再对目标图逐像素反算源坐标 + 双线性采样。
 */
async function jsWarp(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  quad: Quad,
  outW: number,
  outH: number,
): Promise<Blob> {
  const img = imageDataFrom(canvasFromSource(source, srcW, srcH));
  const dst: [number, number][] = [
    [0, 0],
    [outW - 1, 0],
    [outW - 1, outH - 1],
    [0, outH - 1],
  ];
  // H = [h1..h7], h8=1: X = (h1x+h2y+h3)/(h7x+1), Y = (h4x+h5y+h6)/(h7x+1)
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = dst[i];
    const [X, Y] = quad[i];
    const g = x * X + y * X - X;
    A.push([x, y, 1, 0, 0, 0, g]);
    b.push(-X);
    A.push([0, 0, 0, x, y, 1, (x * Y + y * Y - Y)]);
    b.push(-Y);
  }
  const h = solveLinear(A, b);
  const out = new Uint8ClampedArray(outW * outH * 4);
  for (let py = 0; py < outH; py++) {
    for (let px = 0; px < outW; px++) {
      const den = h[6] * px + 1;
      const sx = (h[0] * px + h[1] * py + h[2]) / den;
      const sy = (h[3] * px + h[4] * py + h[5]) / den;
      bilinear(img, srcW, srcH, sx, sy, out, (py * outW + px) * 4);
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  canvas.getContext('2d')!.putImageData(new ImageData(out, outW, outH), 0, 0);
  return canvasToBlob(canvas);
}

function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    [M[col], M[piv]] = [M[piv], M[col]];
    const d = M[col][col] || 1e-9;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / d;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / (row[i] || 1e-9));
}

function bilinear(
  img: ImageData,
  w: number,
  h: number,
  fx: number,
  fy: number,
  out: Uint8ClampedArray,
  idx: number,
) {
  if (fx < 0 || fy < 0 || fx > w - 1 || fy > h - 1) {
    out[idx] = out[idx + 1] = out[idx + 2] = 255;
    out[idx + 3] = 255;
    return;
  }
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, w - 1);
  const y1 = Math.min(y0 + 1, h - 1);
  const ax = fx - x0;
  const ay = fy - y0;
  for (let c = 0; c < 3; c++) {
    const p00 = img.data[(y0 * w + x0) * 4 + c];
    const p10 = img.data[(y0 * w + x1) * 4 + c];
    const p01 = img.data[(y1 * w + x0) * 4 + c];
    const p11 = img.data[(y1 * w + x1) * 4 + c];
    out[idx + c] = p00 * (1 - ax) * (1 - ay) + p10 * ax * (1 - ay) + p01 * (1 - ax) * ay + p11 * ax * ay;
  }
  out[idx + 3] = 255;
}

/** 生成最长边 ~512px 的缩略图 */
export async function makeThumbnail(source: CanvasImageSource, w: number, h: number): Promise<Blob> {
  const scale = Math.min(1, 512 / Math.max(w, h));
  const canvas = canvasFromSource(source, Math.max(2, Math.round(w * scale)), Math.max(2, Math.round(h * scale)));
  return canvasToBlob(canvas, 'image/jpeg', 0.75);
}
