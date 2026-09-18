/** 时间槽的上课周次：单双周、前/后八周都是它的特例。缺省 = 每周 */
export interface WeeksSpec {
  from: number; // 起始教学周（≥1）
  to: number; // 结束教学周（≥from）
  step: number; // 1 = 每周连续，2 = 隔周
}

export interface ScheduleSlot {
  weekday: number; // 0=周日 1-6=周一~周六
  startMin: number; // 当天分钟数，如 10:00 => 600
  endMin: number;
  weeks?: WeeksSpec; // 缺省 = 每周
}

export interface Course {
  id: string;
  name: string;
  color: string;
  slots: ScheduleSlot[];
  createdAt: number;
}

/** 笔迹/文字标注（矢量层）。坐标为相对裁剪图的 0~1 归一化值（y 同为图宽单位），与分辨率解耦 */
export interface PenAnnotation {
  kind: 'pen';
  id: string;
  createdAt: number;
  color: string;
  width: number; // 归一化线宽（相对图宽）
  points: [number, number][];
}
export interface HighlighterAnnotation {
  kind: 'highlighter';
  id: string;
  createdAt: number;
  color: string;
  width: number;
  points: [number, number][];
}
export interface TextAnnotation {
  kind: 'text';
  id: string;
  createdAt: number;
  x: number; // 文字框左上角
  y: number;
  text: string;
}
export type Annotation = PenAnnotation | HighlighterAnnotation | TextAnnotation;

export interface PhotoMeta {
  id: string;
  fileName: string; // 原图（OPFS 文件名）
  thumbFileName?: string; // ~512px 缩略图
  cropFileName?: string; // 透视校正后的裁剪图
  quad?: [number, number][]; // 裁剪四角，原图像素坐标
  mimeType: string;
  takenAt: number | null; // EXIF 拍摄时间（epoch ms），取不到为 null
  createdAt: number; // 入库时间
  backedUpAt?: number | null; // 被完整导出包收录的时间
  originalRemoved?: boolean; // 原图已清理（省空间），缩略图/裁剪图仍在
  courseId: string; // '' 表示未归属课程
  capture: 'auto' | 'manual' | 'none'; // 归档方式，M4 起使用
  starred?: boolean; // 重点标记：复习时按课程 + 只看标星
  annotations?: Annotation[]; // 矢量标注层（重新裁剪会清空）
  note: string;
}

export function slotToString(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** 列表/大图可用的最佳文件：缩略图 > 裁剪图 > 原图（已清理则跳过原图） */
export function displayFile(photo: PhotoMeta): string | undefined {
  if (photo.thumbFileName) return photo.thumbFileName;
  if (photo.cropFileName) return photo.cropFileName;
  return photo.originalRemoved ? undefined : photo.fileName;
}

export const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
