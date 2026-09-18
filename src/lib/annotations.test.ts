import test from 'node:test';
import assert from 'node:assert/strict';
import { distToSegment, hitTest, simplifyPoints, toNormalized, textBoxSize } from './annotations';
import type { Annotation } from '../types';

test('simplifyPoints：密集点按最小距离抽稀，首尾保留', () => {
  const dense: [number, number][] = [
    [0, 0],
    [0.001, 0],
    [0.002, 0],
    [0.01, 0],
    [0.011, 0],
    [0.05, 0],
  ];
  const out = simplifyPoints(dense, 0.005);
  assert.deepEqual(out, [
    [0, 0],
    [0.01, 0],
    [0.05, 0],
  ]);
});

test('distToSegment：垂足在线段上取垂距，在外取端点距', () => {
  const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);
  close(distToSegment(0.5, 0.1, 0, 0, 1, 0), 0.1);
  close(distToSegment(-0.3, 0, 0, 0, 1, 0), 0.3);
  close(distToSegment(1.4, 0, 0, 0, 1, 0), 0.4);
});

const stroke: Annotation = {
  kind: 'pen',
  id: 's1',
  createdAt: 0,
  color: '#111',
  width: 0.004,
  points: [
    [0.1, 0.1],
    [0.5, 0.1],
  ],
};

test('hitTest：笔迹命中线上及线宽附近，远处不命中', () => {
  assert.equal(hitTest(stroke, 0.3, 0.1, 0.002), true);
  assert.equal(hitTest(stroke, 0.3, 0.104, 0.002), true); // 半宽 0.002 + 半径 0.002
  assert.equal(hitTest(stroke, 0.3, 0.2, 0.002), false);
});

const text: Annotation = {
  kind: 'text',
  id: 't1',
  createdAt: 0,
  x: 0.2,
  y: 0.3,
  text: '课本 P45',
};

test('hitTest：文字框按估算尺寸命中', () => {
  const { w, h } = textBoxSize('课本 P45');
  assert.ok(w > 0.1 && w < 0.3);
  assert.equal(hitTest(text, 0.2 + w / 2, 0.3 + h / 2, 0.002), true);
  assert.equal(hitTest(text, 0.2 + w + 0.05, 0.3 + h / 2, 0.002), false);
});

test('toNormalized：光标在图片正中心，标注落在正中心（横版回归样本）', () => {
  // 4:3 横图：宽度归一化下竖直中心是 0.375，不是 0.5
  const [x, y] = toNormalized(0, 0, 1000, 0.75);
  assert.equal(x, 0.5);
  assert.ok(Math.abs(y - 0.375) < 1e-9, `y=${y} 应为 0.375`);
});

test('toNormalized：横版图四边映射到 0/0.75 边界', () => {
  const layoutW = 1000;
  const halfH = 375; // 布局高的一半（像素）
  assert.deepEqual(toNormalized(-500, 0, layoutW, 0.75), [0, 0.375]); // 左边中点
  assert.deepEqual(toNormalized(500, 0, layoutW, 0.75), [1, 0.375]); // 右边中点
  assert.deepEqual(toNormalized(0, -halfH, layoutW, 0.75)[1], 0); // 顶边中点
  assert.deepEqual(toNormalized(0, halfH, layoutW, 0.75)[1], 0.75); // 底边中点
});

test('toNormalized：竖版图下半段不再被夹到 1', () => {
  // 9:16 竖图 aspect≈1.78：底边中点的 y 应为 1.78，而非旧实现的 1
  const [x, y] = toNormalized(0, 889, 1000, 1.778);
  assert.equal(x, 0.5);
  assert.ok(Math.abs(y - 1.778) < 0.01, `y=${y} 应为 1.778`);
  // 超出图片范围的输入仍被夹住
  assert.equal(toNormalized(0, 99999, 1000, 1.778)[1], 1.778);
});
