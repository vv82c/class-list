import type { Annotation } from '../types';

/** 归一化坐标系下的常数 */
export const TEXT_FONT = 0.032; // 文字框字号（相对图宽）
export const TEXT_PAD = 0.008; // 文字框内边距
export const ERASER_RADIUS = 0.012; // 橡皮擦命中半径

/** 笔迹抽稀：离上一个保留点不足 minDist（归一化）的点直接丢弃 */
export function simplifyPoints(
  points: [number, number][],
  minDist: number,
): [number, number][] {
  if (points.length <= 2) return [...points];
  const out: [number, number][] = [points[0]];
  for (const p of points.slice(1)) {
    const last = out[out.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) >= minDist) out.push(p);
  }
  return out;
}

/** 点到线段的最短距离 */
export function distToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** 文字框尺寸估算：CJK 记 1 字宽、ASCII 记 0.55 */
export function textBoxSize(text: string): { w: number; h: number } {
  const units = [...text].reduce(
    (s, ch) => s + (ch.charCodeAt(0) > 0xff ? 1 : 0.55),
    0,
  );
  return {
    w: units * TEXT_FONT * 1.08 + TEXT_PAD * 2,
    h: TEXT_FONT * 1.7,
  };
}

/** 命中测试：橡皮擦与未来的点选删除共用 */
export function hitTest(ann: Annotation, nx: number, ny: number, radius: number): boolean {
  if (ann.kind === 'text') {
    const { w, h } = textBoxSize(ann.text);
    return nx >= ann.x - radius && nx <= ann.x + w + radius && ny >= ann.y - radius && ny <= ann.y + h + radius;
  }
  const threshold = ann.width / 2 + radius;
  if (ann.points.length === 1) {
    return Math.hypot(nx - ann.points[0][0], ny - ann.points[0][1]) <= threshold;
  }
  for (let i = 1; i < ann.points.length; i++) {
    const [ax, ay] = ann.points[i - 1];
    const [bx, by] = ann.points[i];
    if (distToSegment(nx, ny, ax, ay, bx, by) <= threshold) return true;
  }
  return false;
}
