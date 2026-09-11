/**
 * CAPTION RENDERING
 *
 * One code path feeds both the on-screen preview and the burned-in export, so
 * the preview is exact rather than approximate. Nothing here touches the DOM
 * or the store: everything it needs arrives as an argument, which is what lets
 * the export run it against an offscreen canvas at a different resolution.
 */
import type { CapBox, CaptionStyle, Cue } from '../lib/types';
import { clamp } from '../lib/util';
import { cueWords } from '../lib/words';

const easeOut = (x: number): number => 1 - Math.pow(1 - x, 3);

export const fontStr = (st: CaptionStyle, px: number): string =>
  `${st.weight} ${px}px "${st.font}", sans-serif`;

export function cueAt(cues: Cue[], t: number): number {
  for (let i = 0; i < cues.length; i++) {
    const c = cues[i] as Cue;
    if (t >= c.start && t < c.end) return i;
  }
  return -1;
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of String(text).split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push('');
      continue;
    }
    let line = words[0] as string;
    for (let i = 1; i < words.length; i++) {
      const t = `${line} ${words[i]}`;
      if (ctx.measureText(t).width > maxW) {
        out.push(line);
        line = words[i] as string;
      } else line = t;
    }
    out.push(line);
  }
  return out;
}

interface Geom {
  maxW: number;
  lh: number;
  bottom: number;
  startY: number;
  anchorX: number;
}

/** Anchor + geometry shared by both caption modes. */
function capGeom(W: number, H: number, st: CaptionStyle, nLines: number, fs: number): Geom {
  const maxW = (W * st.width) / 100;
  const lh = fs * st.lineGap;
  const bottom = H - (H * st.bottom) / 100;
  const startY = bottom - (nLines - 1) * lh;
  let anchorX = st.align === 'left' ? (W - maxW) / 2 : st.align === 'right' ? (W + maxW) / 2 : W / 2;
  anchorX += (W * st.xOffset) / 100;
  return { maxW, lh, bottom, startY, anchorX };
}

function strokeFill(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fs: number,
  st: CaptionStyle,
  fill: string,
): void {
  if (st.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,.65)';
    ctx.shadowBlur = fs * 0.22;
    ctx.shadowOffsetY = fs * 0.045;
  }
  if (st.outline > 0) {
    ctx.lineWidth = (fs * st.outline) / 100;
    ctx.strokeStyle = st.outlineColor;
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.strokeText(text, x, y);
  }
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

/** Left edge of a run of width `w` under the current alignment. */
const lineX = (st: CaptionStyle, anchorX: number, w: number): number =>
  st.align === 'left' ? anchorX : st.align === 'right' ? anchorX - w : anchorX - w / 2;

/* ---------- classic: the whole cue at once ---------- */
function paintClassic(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  cue: Cue,
  st: CaptionStyle,
): CapBox | null {
  const raw = st.upper ? cue.text.toUpperCase() : cue.text;
  const fs = (H * st.size) / 100;
  ctx.font = fontStr(st, fs);
  ctx.textBaseline = 'alphabetic';

  const g0 = capGeom(W, H, st, 1, fs);
  const lines = wrapLines(ctx, raw, g0.maxW).filter(Boolean);
  if (!lines.length) return null;

  const g = capGeom(W, H, st, lines.length, fs);
  ctx.textAlign = st.align;

  const padX = fs * 0.34;
  const padY = fs * 0.16;
  let minX = Infinity;
  let maxX = -Infinity;

  if (st.box > 0) {
    ctx.save();
    ctx.globalAlpha = st.box / 100;
    ctx.fillStyle = st.boxColor;
    lines.forEach((ln, i) => {
      const w = ctx.measureText(ln).width;
      const y = g.startY + i * g.lh;
      ctx.fillRect(lineX(st, g.anchorX, w) - padX, y - fs * 0.86 - padY, w + padX * 2, g.lh + padY * 0.6);
    });
    ctx.restore();
  }

  lines.forEach((ln, i) => {
    const w = ctx.measureText(ln).width;
    const y = g.startY + i * g.lh;
    const x = lineX(st, g.anchorX, w);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x + w);
    strokeFill(ctx, ln, g.anchorX, y, fs, st, st.color);
  });

  return {
    x: minX - padX,
    y: g.startY - fs - padY,
    w: maxX - minX + padX * 2,
    h: lines.length * g.lh + padY * 2,
  };
}

/* ---------- word pop: words rise in one at a time, each its own colour ---------- */
interface PopItem {
  label: string;
  w: number;
  t: number;
  d: number;
  i: number;
}

function paintPop(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  cue: Cue,
  st: CaptionStyle,
  now: number,
): CapBox | null {
  const words = cueWords(cue);
  if (!words.length) return null;

  const fs = (H * st.size) / 100;
  ctx.font = fontStr(st, fs);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  const g0 = capGeom(W, H, st, 1, fs);
  const space = ctx.measureText(' ').width;

  // lay the words out into lines
  const lines: { items: PopItem[]; width: number }[] = [];
  let cur = { items: [] as PopItem[], width: 0 };
  words.forEach((o, i) => {
    const label = st.upper ? o.w.toUpperCase() : o.w;
    const w = ctx.measureText(label).width;
    const add = cur.items.length ? space + w : w;
    if (cur.items.length && cur.width + add > g0.maxW) {
      lines.push(cur);
      cur = { items: [], width: 0 };
    }
    cur.items.push({ label, w, t: o.t, d: o.d, i });
    cur.width += cur.items.length === 1 ? w : add;
  });
  if (cur.items.length) lines.push(cur);
  if (!lines.length) return null;

  const g = capGeom(W, H, st, lines.length, fs);
  const rise = (fs * st.rise) / 100;
  const anim = Math.max(0.001, st.animMs / 1000);
  const padX = fs * 0.34;
  const padY = fs * 0.16;
  // Hoisted: this is read once per word per frame otherwise.
  const pal = st.palette.filter(Boolean);

  // A stable plate behind the whole block, so it does not jitter as words land.
  if (st.box > 0) {
    ctx.save();
    ctx.globalAlpha = st.box / 100;
    ctx.fillStyle = st.boxColor;
    lines.forEach((ln, li) => {
      const y = g.startY + li * g.lh;
      ctx.fillRect(
        lineX(st, g.anchorX, ln.width) - padX,
        y - fs * 0.86 - padY,
        ln.width + padX * 2,
        g.lh + padY * 0.6,
      );
    });
    ctx.restore();
  }

  let minX = Infinity;
  let maxX = -Infinity;

  lines.forEach((ln, li) => {
    const baseY = g.startY + li * g.lh;
    let x = lineX(st, g.anchorX, ln.width);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x + ln.width);

    for (const it of ln.items) {
      const age = (now - it.t) / anim;
      let alpha: number;
      let dy: number;
      let scale = 1;

      if (age <= 0) {
        if (!st.ghost) {
          x += it.w + space;
          continue;
        }
        alpha = st.ghost / 100;
        dy = 0;
      } else {
        const p = Math.min(1, age);
        alpha = st.ghost ? st.ghost / 100 + (1 - st.ghost / 100) * p : p;
        dy = (1 - easeOut(p)) * rise;
        if (st.popScale) scale = 1 + (1 - easeOut(p)) * (st.popScale / 100);
      }

      const spoken = now >= it.t && now < it.t + it.d;
      const colour = pal.length ? (pal[(st.perLineColor ? li : it.i) % pal.length] as string) : st.color;

      ctx.save();
      ctx.globalAlpha = clamp(alpha, 0, 1);
      const cxp = x + it.w / 2;
      const cyp = baseY;
      ctx.translate(cxp, cyp + dy);
      const s = scale * (spoken && st.popScale ? 1 + st.popScale / 300 : 1);
      ctx.scale(s, s);
      ctx.translate(-cxp, -cyp);
      strokeFill(ctx, it.label, x, baseY, fs, st, colour);
      ctx.restore();

      x += it.w + space;
    }
  });

  return {
    x: minX - padX,
    y: g.startY - fs - padY,
    w: maxX - minX + padX * 2,
    h: lines.length * g.lh + padY * 2,
  };
}

export interface FrameInput {
  source: CanvasImageSource | null;
  cues: Cue[];
  style: CaptionStyle;
}

/**
 * Paint one complete frame — video underneath, caption on top. Returns the
 * caption's bounds so the preview can hit-test drag-to-position, or null when
 * no caption was drawn.
 */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  t: number,
  { source, cues, style }: FrameInput,
): CapBox | null {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  if (source) {
    try {
      ctx.drawImage(source, 0, 0, W, H);
    } catch {
      /* the frame is not decodable yet — leave it black */
    }
  }

  const i = cueAt(cues, t);
  if (i < 0) return null;
  const cue = cues[i] as Cue;
  if (!String(cue.text || '').trim()) return null;

  return style.mode === 'pop'
    ? paintPop(ctx, W, H, cue, style, t)
    : paintClassic(ctx, W, H, cue, style);
}
