import test from 'node:test';
import assert from 'node:assert/strict';
import { scaleQuad, solveHomography, type Quad } from './crop';

const rect: Quad = [
  [0, 0],
  [100, 0],
  [100, 80],
  [0, 80],
];

/** 用 H 把点 (x,y) 从 dst 映射到 src（与 jsWarp 反算用的是同一个公式） */
function applyH(h: number[], x: number, y: number): [number, number] {
  const den = h[6] * x + h[7] * y + 1;
  return [(h[0] * x + h[1] * y + h[2]) / den, (h[3] * x + h[4] * y + h[5]) / den];
}

function quadArea(q: Quad): number {
  let s = 0;
  for (let i = 0; i < 4; i++) {
    const [x1, y1] = q[i];
    const [x2, y2] = q[(i + 1) % 4];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s / 2);
}

test('单应：恒等映射（dst 与 src 相同）', () => {
  const h = solveHomography(rect, rect);
  const identity = [1, 0, 0, 0, 1, 0, 0, 0];
  h.forEach((v, i) => assert.ok(Math.abs(v - identity[i]) < 1e-9, `h[${i}]=${v}`));
});

test('单应：仿射缩放×2 + 平移', () => {
  const src: Quad = rect.map(([x, y]) => [10 + 2 * x, 20 + 2 * y]) as Quad;
  const h = solveHomography(rect, src);
  const expected = [2, 0, 10, 0, 2, 20, 0, 0];
  h.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) < 1e-9, `h[${i}]=${v}`));
});

test('单应：投影变换可从 4 对应点精确恢复', () => {
  const H0 = [1.05, 0.04, 6, -0.03, 0.92, 4, 0.00025, 0.00018];
  const src = rect.map(([x, y]) => applyH(H0, x, y)) as Quad;
  const h = solveHomography(rect, src);
  h.forEach((v, i) => assert.ok(Math.abs(v - H0[i]) < 1e-6, `h[${i}]=${v} 应为 ${H0[i]}`));
});

test('单应：恢复的 H 能把 dst 角点映回 src 角点', () => {
  const H0 = [0.9, -0.05, 12, 0.06, 1.1, -8, 0.0004, -0.0003];
  const src = rect.map(([x, y]) => applyH(H0, x, y)) as Quad;
  const h = solveHomography(rect, src);
  rect.forEach(([x, y], i) => {
    const [sx, sy] = applyH(h, x, y);
    assert.ok(Math.hypot(sx - src[i][0], sy - src[i][1]) < 1e-6);
  });
});

test('scaleQuad：质心不动，边长减半', () => {
  const shrunk = scaleQuad(rect, 0.5);
  assert.deepEqual(shrunk, [
    [25, 20],
    [75, 20],
    [75, 60],
    [25, 60],
  ]);
});

test('scaleQuad：面积比 ≈ factor²', () => {
  const factor = 0.9;
  const ratio = quadArea(scaleQuad(rect, factor)) / quadArea(rect);
  assert.ok(Math.abs(ratio - factor * factor) < 1e-9, `面积比 ${ratio}`);
});

test('scaleQuad：带边界时角点不越出图像', () => {
  const grown = scaleQuad(rect, 2, { w: 100, h: 80 });
  assert.deepEqual(grown, rect);
});
