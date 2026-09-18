import test from 'node:test';
import assert from 'node:assert/strict';
import { distToSegment, hitTest, simplifyPoints, textBoxSize } from './annotations';
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
