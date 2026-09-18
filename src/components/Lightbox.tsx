import { useEffect, useRef, useState } from 'react';
import { formatTime } from '../lib/ui';
import { readFile } from '../storage/opfs';
import { newId } from '../storage/db';
import { ERASER_RADIUS, hitTest, simplifyPoints, textBoxSize } from '../lib/annotations';
import { displayFile, type Annotation, type Course, type PhotoMeta } from '../types';
import AnnotationLayer from './AnnotationLayer';

interface View {
  zoom: number;
  x: number;
  y: number;
}

const IDENTITY: View = { zoom: 1, x: 0, y: 0 };
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

const PEN_COLORS = ['#111827', '#dc2626', '#2563eb'];
const HIGHLIGHT_COLORS = ['#facc15', '#4ade80'];
const PEN_WIDTH = 0.0035;
const HIGHLIGHTER_WIDTH = 0.028;

type Tool = 'pen' | 'highlighter' | 'text' | 'eraser';

interface Props {
  photos: PhotoMeta[];
  index: number;
  courses: Course[];
  onIndex: (i: number) => void;
  onClose: () => void;
  onRecrop: (photo: PhotoMeta) => void;
  onToggleStar: (photo: PhotoMeta) => void;
  onSaveAnnotations: (photo: PhotoMeta, annotations: Annotation[]) => void;
}

/** 全屏大图复习：← → 翻页、空格连播、滚轮缩放、双击放大/复位；✏️ 进入标注模式 */
export default function Lightbox({
  photos,
  index,
  courses,
  onIndex,
  onClose,
  onRecrop,
  onToggleStar,
  onSaveAnnotations,
}: Props) {
  const photo = photos[index];
  const [variant, setVariant] = useState<'crop' | 'original'>('crop');
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [url, setUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [starred, setStarred] = useState(!!photo?.starred);
  const [view, setView] = useState<View>(IDENTITY);
  const [playing, setPlaying] = useState(false);

  // 标注模式
  const [editing, setEditing] = useState(false);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState(PEN_COLORS[0]);
  const [anns, setAnns] = useState<Annotation[]>([]);
  const [dirty, setDirty] = useState(false);
  const [undoDepth, setUndoDepth] = useState(0);
  const [live, setLive] = useState<Annotation | null>(null);
  const [textInput, setTextInput] = useState<{ nx: number; ny: number; value: string; editId?: string; sx: number; sy: number } | null>(null);
  const annsRef = useRef(anns);
  annsRef.current = anns;
  const dirtyRef = useRef(false);
  const undoStack = useRef<Annotation[][]>([]);
  const drawingRef = useRef<{ id: string; kind: 'pen' | 'highlighter'; points: [number, number][] } | null>(null);
  const erasingRef = useRef<{ snapshot: Annotation[] | null } | null>(null);
  const panRef = useRef<{ x: number; y: number } | null>(null);
  const spaceRef = useRef(false);
  const suppressClickRef = useRef(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const onIndexRef = useRef(onIndex);
  onIndexRef.current = onIndex;
  const onSaveRef = useRef(onSaveAnnotations);
  onSaveRef.current = onSaveAnnotations;

  useEffect(() => {
    setVariant(photo?.cropFileName ? 'crop' : 'original');
  }, [photo?.id, photo?.cropFileName]);

  // 换照片：复位缩放、标星显示与标注草稿
  useEffect(() => {
    setView(IDENTITY);
    setStarred(!!photo?.starred);
    setAnns(photo?.annotations ?? []);
    setEditing(false);
    setDirty(false);
    dirtyRef.current = false;
    undoStack.current = [];
    setUndoDepth(0);
    setTextInput(null);
    setLive(null);
  }, [photo?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const wanted = photo ? (variant === 'crop' ? photo.cropFileName : photo.fileName) : undefined;

  useEffect(() => {
    let dead = false;
    let objectUrl: string | null = null;
    setUrl(null);
    setNatural(null);
    setStatus('loading');
    if (!photo) return;
    (async () => {
      // 请求的版本可能在磁盘上不存在（如原图已清理），退回可用文件
      const candidates = [wanted, displayFile(photo)].filter((v): v is string => !!v);
      for (const name of candidates) {
        const file = await readFile(name);
        if (dead) return;
        if (file) {
          objectUrl = URL.createObjectURL(file);
          setUrl(objectUrl);
          setStatus('ready');
          return;
        }
      }
      if (!dead) setStatus('missing');
    })();
    return () => {
      dead = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photo, wanted]);

  // 连播：每 3 秒自动翻页，到最后一张回卷
  useEffect(() => {
    if (!playing || photos.length < 2) return;
    const t = setInterval(() => navigate((index + 1) % photos.length), 3000);
    return () => clearInterval(t);
  }, [playing, index, photos.length]);

  /** 脏标注先落库再离开当前照片 */
  function persist() {
    if (!dirtyRef.current || !photo) return;
    onSaveRef.current(photo, annsRef.current);
    dirtyRef.current = false;
    setDirty(false);
  }

  function navigate(i: number) {
    persist();
    onIndexRef.current(i);
  }

  function requestClose() {
    persist();
    onClose();
  }

  function setEditMode(on: boolean) {
    if (on) {
      setVariant('crop'); // 标注只在裁剪视图
      setPlaying(false);
      setAnns(photo?.annotations ?? []);
      dirtyRef.current = false;
      setDirty(false);
      undoStack.current = [];
      setUndoDepth(0);
      setEditing(true);
    } else {
      setEditing(false);
      setTextInput(null);
      persist();
    }
  }

  function markDirty() {
    dirtyRef.current = true;
    setDirty(true);
  }

  function pushUndo() {
    undoStack.current.push(annsRef.current.map((a) => ({ ...a })));
    setUndoDepth(undoStack.current.length);
  }

  function undo() {
    const prev = undoStack.current.pop();
    if (!prev) return;
    setAnns(prev);
    setUndoDepth(undoStack.current.length);
    markDirty();
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (textInput) setTextInput(null);
        else if (editing) setEditMode(false);
        else requestClose();
        return;
      }
      if (editing && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
        return;
      }
      if (editing && (e.key === ' ' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) e.preventDefault();
      if (!editing && e.key === ' ') setPlaying((p) => !p);
      if (e.key === 'ArrowLeft') navigate(Math.max(0, index - 1));
      if (e.key === 'ArrowRight') navigate(Math.min(photos.length - 1, index + 1));
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') spaceRef.current = false;
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [index, photos.length, editing, textInput]); // eslint-disable-line react-hooks/exhaustive-deps

  // 连播/键盘回调里的 index 通过 navigate 闭包获取，playing 效果依赖 index 触发重排
  useEffect(() => {
    onIndexRef.current = onIndex;
  });

  // 缩放以指定点（相对盒子中心，屏幕坐标）为锚，平移夹紧到图片中心不出画布
  function zoomAt(factor: number, cx: number, cy: number) {
    setView((v) => {
      const zoom = clamp(v.zoom * factor, 1, 8);
      if (zoom === 1) return IDENTITY;
      const k = zoom / v.zoom;
      const rect = boxRef.current?.getBoundingClientRect();
      const mx = rect ? (rect.width * zoom) / 2 : Infinity;
      const my = rect ? (rect.height * zoom) / 2 : Infinity;
      return {
        zoom,
        x: clamp(cx * (1 - k) + v.x * k, -mx, mx),
        y: clamp(cy * (1 - k) + v.y * k, -mx, my),
      };
    });
  }

  // React 的 onWheel 是 passive 的，preventDefault 必须挂原生监听
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = box.getBoundingClientRect();
      const cx = e.clientX - (rect.left + rect.width / 2);
      const cy = e.clientY - (rect.top + rect.height / 2);
      zoomAt(e.deltaY < 0 ? 1.25 : 0.8, cx, cy);
    };
    box.addEventListener('wheel', onWheel, { passive: false });
    return () => box.removeEventListener('wheel', onWheel);
  });

  /** 屏幕坐标 → 宽度归一化坐标（y 同为图宽单位），含缩放与平移 */
  function toNorm(clientX: number, clientY: number): [number, number] {
    const rect = boxRef.current!.getBoundingClientRect();
    const layoutW = rect.width / view.zoom;
    return [
      clamp(0.5 + (clientX - (rect.left + rect.width / 2) - view.x) / layoutW, 0, 1),
      clamp(0.5 + (clientY - (rect.top + rect.height / 2) - view.y) / layoutW, 0, 1),
    ];
  }

  function onPointerDown(e: React.PointerEvent) {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // 合成事件没有活动指针，忽略
    }
    if (editing && !spaceRef.current && e.button === 0) {
      if (tool === 'pen' || tool === 'highlighter') {
        const [nx, ny] = toNorm(e.clientX, e.clientY);
        drawingRef.current = { id: newId(), kind: tool, points: [[nx, ny]] };
        setLive({
          kind: tool,
          id: drawingRef.current.id,
          createdAt: 0,
          color,
          width: tool === 'pen' ? PEN_WIDTH : HIGHLIGHTER_WIDTH,
          points: drawingRef.current.points,
        });
        return;
      }
      if (tool === 'eraser') {
        erasingRef.current = { snapshot: null };
        eraseAt(e.clientX, e.clientY);
        return;
      }
      if (tool === 'text') return; // 文字在 click（区分平移拖动）后放置
    }
    // 查看模式：放大后拖动平移；标注模式：空格/中键拖动平移
    if (view.zoom > 1 && (!editing || spaceRef.current || e.button === 1)) {
      panRef.current = { x: e.clientX, y: e.clientY };
      suppressClickRef.current = true;
    }
  }

  function eraseAt(clientX: number, clientY: number) {
    const [nx, ny] = toNorm(clientX, clientY);
    const before = annsRef.current;
    const after = before.filter((a) => !hitTest(a, nx, ny, ERASER_RADIUS));
    if (after.length !== before.length) {
      if (erasingRef.current && !erasingRef.current.snapshot) {
        erasingRef.current.snapshot = before;
      }
      annsRef.current = after;
      setAnns(after);
      markDirty();
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (drawingRef.current) {
      const [nx, ny] = toNorm(e.clientX, e.clientY);
      const pts = drawingRef.current.points;
      const last = pts[pts.length - 1];
      if (Math.hypot(nx - last[0], ny - last[1]) >= 0.004) {
        pts.push([nx, ny]);
        setLive({
          kind: drawingRef.current.kind,
          id: drawingRef.current.id,
          createdAt: 0,
          color,
          width: drawingRef.current.kind === 'pen' ? PEN_WIDTH : HIGHLIGHTER_WIDTH,
          points: [...pts],
        });
      }
      return;
    }
    if (erasingRef.current) {
      eraseAt(e.clientX, e.clientY);
      return;
    }
    if (panRef.current) {
      const dx = e.clientX - panRef.current.x;
      const dy = e.clientY - panRef.current.y;
      panRef.current = { x: e.clientX, y: e.clientY };
      setView((v) => {
        const rect = boxRef.current?.getBoundingClientRect();
        const mx = rect ? (rect.width * v.zoom) / 2 : Infinity;
        const my = rect ? (rect.height * v.zoom) / 2 : Infinity;
        return { ...v, x: clamp(v.x + dx, -mx, mx), y: clamp(v.y + dy, -my, my) };
      });
    }
  }

  function onPointerUp() {
    if (drawingRef.current) {
      const d = drawingRef.current;
      drawingRef.current = null;
      setLive(null);
      if (d.points.length >= 1) {
        pushUndo();
        const ann: Annotation = {
          kind: d.kind,
          id: d.id,
          createdAt: Date.now(),
          color,
          width: d.kind === 'pen' ? PEN_WIDTH : HIGHLIGHTER_WIDTH,
          points: simplifyPoints(d.points, 0.003),
        };
        setAnns((a) => [...a, ann]);
        annsRef.current = [...annsRef.current, ann];
        markDirty();
      }
      return;
    }
    if (erasingRef.current) {
      const { snapshot } = erasingRef.current;
      erasingRef.current = null;
      if (snapshot) {
        undoStack.current.push(snapshot);
        setUndoDepth(undoStack.current.length);
      }
      return;
    }
    panRef.current = null;
  }

  /** 点击盒子：阻止冒泡到遮罩关闭；文字工具时放置输入框 */
  function onBoxClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (!editing || tool !== 'text' || !photo) return;
    const [nx, ny] = toNorm(e.clientX, e.clientY);
    setTextInput({
      nx,
      ny,
      value: '',
      sx: e.clientX + 12,
      sy: e.clientY + 8,
    });
  }

  function onDoubleClick(e: React.MouseEvent) {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (editing && tool === 'text') {
      const [nx, ny] = toNorm(e.clientX, e.clientY);
      const target = annsRef.current.find((a) => a.kind === 'text' && hitTest(a, nx, ny, 0.005));
      if (target && target.kind === 'text') {
        setTextInput({ nx: target.x, ny: target.y, value: target.text, editId: target.id, sx: e.clientX + 12, sy: e.clientY + 8 });
      }
      return;
    }
    if (view.zoom === 1) {
      zoomAt(2.5, e.clientX - (rect.left + rect.width / 2), e.clientY - (rect.top + rect.height / 2));
    } else {
      setView(IDENTITY);
    }
  }

  function commitText() {
    if (!textInput) return;
    const value = textInput.value.trim();
    const { nx, ny, editId } = textInput;
    setTextInput(null);
    if (!value) return;
    pushUndo();
    if (editId) {
      const next = annsRef.current.map((a) => (a.id === editId && a.kind === 'text' ? { ...a, text: value } : a));
      setAnns(next);
      annsRef.current = next;
    } else {
      const { w, h } = textBoxSize(value);
      const aspect = natural ? natural.h / natural.w : 0.75;
      const ann: Annotation = {
        kind: 'text',
        id: newId(),
        createdAt: Date.now(),
        x: clamp(nx, 0, Math.max(0, 1 - w)),
        y: clamp(ny, 0, Math.max(0.01, aspect - h)),
        text: value,
      };
      const next = [...annsRef.current, ann];
      setAnns(next);
      annsRef.current = next;
    }
    markDirty();
  }

  if (!photo) return null;
  const course = courses.find((c) => c.id === photo.courseId);
  const canOriginal = !photo.originalRemoved && !!photo.fileName;
  const aspect = natural ? natural.h / natural.w : 0.75;
  const renderAnns = live ? [...anns, live] : anns;

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-black/95" onClick={requestClose}>
      <div
        className="flex items-center gap-3 px-4 py-3 text-sm text-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {course && (
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: course.color }} />
            {course.name}
          </span>
        )}
        <span className="text-slate-400">{formatTime(photo.takenAt)}</span>
        <button
          onClick={() => {
            setStarred((s) => !s);
            onToggleStar(photo);
          }}
          className={`rounded-lg px-2 py-1 hover:bg-white/10 ${starred ? 'font-medium text-amber-400' : 'text-slate-300'}`}
        >
          {starred ? '★ 已标星' : '☆ 标星'}
        </button>
        {dirty && <span className="text-xs text-amber-400">标注未保存</span>}
        <span className="ml-auto text-slate-400">
          {index + 1} / {photos.length}
        </span>
        <button
          onClick={requestClose}
          className="rounded-lg px-2 py-1 text-slate-300 hover:bg-white/10"
        >
          关闭 ✕
        </button>
      </div>

      <div
        ref={boxRef}
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-2"
        onClick={onBoxClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
        style={{ touchAction: 'none' }}
      >
        {url ? (
          <>
            <img
              src={url}
              alt=""
              draggable={false}
              className="max-h-full max-w-full select-none object-contain"
              style={{
                transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
                cursor: editing
                  ? tool === 'text'
                    ? 'text'
                    : tool === 'eraser'
                      ? 'pointer'
                      : 'crosshair'
                  : view.zoom > 1
                    ? 'grab'
                    : 'zoom-in',
              }}
              onLoad={(e) => {
                const el = e.currentTarget;
                setNatural({ w: el.naturalWidth, h: el.naturalHeight });
              }}
            />
            {variant === 'crop' && natural && (editing || anns.length > 0) && (
              <AnnotationLayer
                annotations={renderAnns}
                aspect={aspect}
                transform={`translate(${view.x}px, ${view.y}px) scale(${view.zoom})`}
              />
            )}
          </>
        ) : (
          <p className="text-sm text-slate-400">
            {status === 'missing' ? '这张照片的图片文件已丢失（记录仍在，可删除该条目）' : '读取中…'}
          </p>
        )}
        <p className="pointer-events-none absolute bottom-1.5 left-3 text-xs text-slate-500">
          {editing
            ? {
                pen: '拖动画字 · 滚轮缩放 · 空格+拖动平移',
                highlighter: '拖动涂抹 · 滚轮缩放 · 空格+拖动平移',
                text: '点击放置文字 · 双击已有文字可修改',
                eraser: '点击或扫过要删除的笔迹/文字',
              }[tool]
            : variant === 'crop' && anns.length > 0
              ? '有标注 · 滚轮缩放 · 双击放大/复位 · ✏️ 可编辑'
              : '滚轮缩放 · 双击放大/复位'}
          {!editing && view.zoom > 1 ? ` · ${Math.round(view.zoom * 100)}%` : ''}
        </p>
      </div>

      {editing ? (
        <div
          className="flex items-center justify-center gap-1.5 px-4 py-3"
          onClick={(e) => e.stopPropagation()}
        >
          {(
            [
              ['pen', '✒️ 碳素笔'],
              ['highlighter', '🖍 荧光笔'],
              ['text', '🅣 文字'],
              ['eraser', '🧽 橡皮'],
            ] as [Tool, string][]
          ).map(([t, label]) => (
            <button
              key={t}
              onClick={() => {
                setTool(t);
                if (t === 'highlighter') setColor(HIGHLIGHT_COLORS[0]);
                if (t === 'pen') setColor(PEN_COLORS[0]);
              }}
              className={`rounded-lg px-3 py-2 text-sm ${
                tool === t ? 'bg-sky-500 text-white' : 'bg-white/10 text-white'
              }`}
            >
              {label}
            </button>
          ))}
          <span className="mx-1 h-6 w-px bg-white/20" />
          {(tool === 'highlighter' ? HIGHLIGHT_COLORS : PEN_COLORS).map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`h-7 w-7 rounded-full border-2 ${color === c ? 'border-white' : 'border-transparent'}`}
              style={{ backgroundColor: c }}
              aria-label={`颜色 ${c}`}
            />
          ))}
          <span className="mx-1 h-6 w-px bg-white/20" />
          <button
            onClick={undo}
            disabled={undoDepth === 0}
            className="rounded-lg bg-white/10 px-3 py-2 text-sm text-white disabled:opacity-30"
          >
            ↩ 撤销
          </button>
          <button
            onClick={() => setEditMode(false)}
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white"
          >
            ✓ 完成
          </button>
        </div>
      ) : (
        <div
          className="flex items-center justify-center gap-2 px-4 py-3"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => navigate(Math.max(0, index - 1))}
            disabled={index === 0}
            className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white disabled:opacity-30"
          >
            ← 上一张
          </button>
          {photos.length > 1 && (
            <button
              onClick={() => setPlaying((p) => !p)}
              className={`rounded-lg px-4 py-2 text-sm ${
                playing ? 'bg-sky-500 text-white' : 'bg-white/10 text-white'
              }`}
            >
              {playing ? '⏸ 暂停' : '▶ 连播'}
            </button>
          )}
          <button
            onClick={() => setEditMode(true)}
            disabled={variant !== 'crop'}
            className="rounded-lg bg-amber-500/90 px-4 py-2 text-sm font-medium text-white disabled:opacity-30"
          >
            ✏️ 标注
          </button>
          {photo.cropFileName && canOriginal && (
            <button
              onClick={() => setVariant(variant === 'crop' ? 'original' : 'crop')}
              className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white"
            >
              看{variant === 'crop' ? '原图' : '裁剪图'}
            </button>
          )}
          {canOriginal && (
            <button
              onClick={() => onRecrop(photo)}
              className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white"
            >
              重新裁剪
            </button>
          )}
          <button
            onClick={() => navigate(Math.min(photos.length - 1, index + 1))}
            disabled={index >= photos.length - 1}
            className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white disabled:opacity-30"
          >
            下一张 →
          </button>
        </div>
      )}

      {textInput && (
        <input
          autoFocus
          value={textInput.value}
          onChange={(e) => setTextInput({ ...textInput, value: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitText();
            if (e.key === 'Escape') {
              e.stopPropagation();
              setTextInput(null);
            }
          }}
          onBlur={commitText}
          placeholder="输入标注文字，回车确认"
          className="fixed z-40 w-56 rounded-md border-2 border-amber-400 bg-white/95 px-2 py-1 text-sm text-slate-900 shadow-lg"
          style={{ left: Math.min(textInput.sx, window.innerWidth - 260), top: textInput.sy }}
        />
      )}
    </div>
  );
}
