export interface ScheduleSlot {
  weekday: number; // 0=周日 1-6=周一~周六
  startMin: number; // 当天分钟数，如 10:00 => 600
  endMin: number;
}

export interface Course {
  id: string;
  name: string;
  color: string;
  slots: ScheduleSlot[];
  createdAt: number;
}

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
