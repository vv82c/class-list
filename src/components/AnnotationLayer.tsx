import type { Annotation } from '../types';
import { TEXT_FONT, TEXT_PAD, textBoxSize } from '../lib/annotations';

const S = 1000; // 渲染缩放：所有归一化坐标 × 1000 进入 viewBox（y 同为图宽单位）

/**
 * 标注渲染层：与图片等大小的 SVG 覆盖层，跟随图片同款 transform，
 * 整体 mix-blend multiply——笔迹像墨水一样融进纸面，黑笔压字不糊、荧光笔透字。
 */
export default function AnnotationLayer({
  annotations,
  aspect,
  transform,
}: {
  annotations: Annotation[];
  aspect: number; // 图片高/宽
  transform?: string; // 与图片元素保持一致的 transform
}) {
  const vbH = Math.max(1, Math.round(S * aspect));
  return (
    <svg
      viewBox={`0 0 ${S} ${vbH}`}
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ mixBlendMode: 'multiply', transform }}
    >
      {annotations.map((a) => {
        if (a.kind === 'highlighter') {
          return (
            <polyline
              key={a.id}
              points={a.points.map(([x, y]) => `${x * S},${y * S}`).join(' ')}
              fill="none"
              stroke={a.color}
              strokeWidth={a.width * S}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.35}
            />
          );
        }
        if (a.kind === 'pen') {
          if (a.points.length === 1) {
            return (
              <circle
                key={a.id}
                cx={a.points[0][0] * S}
                cy={a.points[0][1] * S}
                r={(a.width * S) / 2}
                fill={a.color}
              />
            );
          }
          return (
            <polyline
              key={a.id}
              points={a.points.map(([x, y]) => `${x * S},${y * S}`).join(' ')}
              fill="none"
              stroke={a.color}
              strokeWidth={a.width * S}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        }
        const fs = TEXT_FONT * S;
        const w = textBoxSize(a.text).w * S;
        const h = textBoxSize(a.text).h * S;
        const x = a.x * S;
        const y = a.y * S;
        return (
          <g key={a.id}>
            <rect x={x} y={y} width={w} height={h} rx={fs * 0.15} fill="#fffbeb" opacity={0.92} stroke="#f59e0b" strokeWidth={fs * 0.06} />
            <text x={x + TEXT_PAD * S} y={y + TEXT_PAD * S + fs * 0.95} fontSize={fs} fill="#0f172a">
              {a.text}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
