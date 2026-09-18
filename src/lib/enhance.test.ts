import test from 'node:test';
import assert from 'node:assert/strict';
import { autoLevels, unsharpMask } from './enhance';

/** 造一张 n 像素的 RGBA 图 */
function pixels(rgbs: [number, number, number][]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(rgbs.length * 4);
  rgbs.forEach(([r, g, b], i) => {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  });
  return data;
}

test('autoLevels：R 通道 10~150 拉伸到 0~255', () => {
  const data = pixels([
    [10, 128, 128],
    [100, 128, 128],
    [120, 128, 128],
    [150, 128, 128],
  ]);
  autoLevels(data);
  assert.equal(data[0], 0); // 10 → 0
  assert.equal(data[4], 164); // 100 → round(90/140*255)
  assert.equal(data[8], 200); // 120 → round(110/140*255)
  assert.equal(data[12], 255); // 150 → 255
});

/** 第 i 个像素的 R 分量（一个像素占 4 字节） */
const R = (data: Uint8ClampedArray, i: number) => data[i * 4];

test('autoLevels：内容平坦的通道跳过不被噪声炸开', () => {
  const data = pixels([
    [50, 128, 200],
    [50, 130, 202],
    [52, 129, 201],
    [51, 128, 200],
  ]);
  autoLevels(data);
  // 三个通道的跨度都只有 2，全部跳过，数据应原样保留
  assert.equal(R(data, 0), 50);
  assert.equal(R(data, 2), 52);
  assert.equal(data[1 * 4 + 1], 130); // p1.G
  assert.equal(data[2 * 4 + 2], 201); // p2.B
});

test('unsharpMask：边缘更陡（亮侧更亮、暗侧更暗）', () => {
  // 3×3 图：全 100，仅中心 200
  const data = pixels(
    Array.from({ length: 9 }, (_, i): [number, number, number] => [i === 4 ? 200 : 100, 0, 0]),
  );
  unsharpMask(data, 3, 3, 0.4);
  assert.ok(R(data, 4) > 220, `中心应被推得更亮，实际 ${R(data, 4)}`);
  assert.ok(R(data, 0) < 100 && R(data, 8) < 100, `角落应被压得更暗，实际 ${R(data, 0)}/${R(data, 8)}`);
});

test('unsharpMask：均匀区域完全不变化', () => {
  const data = pixels(Array.from({ length: 9 }, (): [number, number, number] => [180, 90, 60]));
  const before = new Uint8ClampedArray(data);
  unsharpMask(data, 3, 3, 0.8);
  assert.deepEqual(new Uint8ClampedArray(data), before);
});
