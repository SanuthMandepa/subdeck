/**
 * The waveform / cue timeline.
 *
 * Canvas rather than DOM because it redraws every frame while playing and can
 * hold thousands of cue blocks. Colours are duplicated from the CSS tokens
 * here because canvas cannot read custom properties.
 */
import { tc } from '../lib/timecode';
import type { Cue } from '../lib/types';
import { clamp } from '../lib/util';

const C = {
  bg: '#080a0c',
  ruler: '#0d1014',
  gridline: '#232932',
  rulerText: '#5b6270',
  wave: '#2d3742',
  waveEmpty: '#333c47',
  block: '#39414e',
  blockEdge: '#4b5566',
  blockText: '#c8ccd3',
  sel: '#54d7e8',
  selEdge: '#9beaf5',
  live: '#ffb43d',
  liveEdge: '#ffd28a',
  onBlockText: '#101216',
  playhead: '#ffb43d',
} as const;

const RULER_H = 15;
/** Height of the strip at the bottom that holds the cue blocks. */
export const BAND_H = 26;
const BLOCK_H = 20;
/** Pointer slop, in pixels, for grabbing a block's edge. */
export const EDGE_GRAB = 6;

/** The visible window as [start, duration]. Zoom 0 means "fit the whole file". */
export function viewRange(zoom: number, view: number, dur: number): [number, number] {
  if (!zoom || zoom >= dur) return [0, dur || 1];
  return [clamp(view, 0, Math.max(0, dur - zoom)), zoom];
}

/** Resize the backing store to the CSS box at device resolution. */
export function fitCanvas(cv: HTMLCanvasElement): { w: number; h: number; dpr: number } {
  const r = cv.parentElement?.getBoundingClientRect() ?? cv.getBoundingClientRect();
  const dpr = devicePixelRatio || 1;
  const w = Math.max(1, Math.round(r.width * dpr));
  const h = Math.max(1, Math.round(r.height * dpr));
  if (cv.width !== w || cv.height !== h) {
    cv.width = w;
    cv.height = h;
  }
  return { w: r.width, h: r.height, dpr };
}

export interface TimelineInput {
  cues: Cue[];
  sel: number;
  peaks: Float32Array | null;
  dur: number;
  zoom: number;
  view: number;
  now: number;
  ready: boolean;
}

const TICK_STEPS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900];

export function drawTimeline(
  cv: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  input: TimelineInput,
): void {
  const { w, h, dpr } = fitCanvas(cv);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, w, h);
  if (!input.ready) return;

  const { cues, sel, peaks, dur, zoom, view, now } = input;
  const [a, d] = viewRange(zoom, view, dur);
  const x = (t: number) => ((t - a) / d) * w;
  const waveH = h - RULER_H - BAND_H;
  const waveY = RULER_H;

  /* ruler */
  ctx.fillStyle = C.ruler;
  ctx.fillRect(0, 0, w, RULER_H);
  const step = TICK_STEPS.find((s) => (s / d) * w > 62) ?? 1800;
  ctx.font = '9px "Chivo Mono",monospace';
  ctx.textBaseline = 'middle';
  for (let t = Math.ceil(a / step) * step; t < a + d; t += step) {
    const px = Math.round(x(t)) + 0.5;
    ctx.strokeStyle = C.gridline;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, h);
    ctx.stroke();
    ctx.fillStyle = C.rulerText;
    ctx.textAlign = 'left';
    ctx.fillText(tc(t, '.', step < 1), px + 4, RULER_H / 2);
  }

  /* waveform */
  if (peaks) {
    const mid = waveY + waveH / 2;
    const N = peaks.length;
    ctx.fillStyle = C.wave;
    for (let px = 0; px < w; px++) {
      const t0 = a + (px / w) * d;
      const t1 = a + ((px + 1) / w) * d;
      const i0 = clamp(Math.floor((t0 / dur) * N), 0, N - 1);
      const i1 = clamp(Math.ceil((t1 / dur) * N), i0 + 1, N);
      let mx = 0;
      for (let i = i0; i < i1; i++) if ((peaks[i] as number) > mx) mx = peaks[i] as number;
      const half = Math.max(0.5, mx * waveH * 0.46);
      ctx.fillRect(px, mid - half, 1, half * 2);
    }
  } else {
    ctx.fillStyle = C.waveEmpty;
    ctx.font = '10px "Chivo Mono",monospace';
    ctx.textAlign = 'center';
    ctx.fillText('decoding audio…', w / 2, waveY + waveH / 2);
  }

  /* cue blocks */
  const by = h - (BAND_H - 2);
  cues.forEach((c, i) => {
    const x0 = x(c.start);
    const x1 = x(c.end);
    if (x1 < -20 || x0 > w + 20) return;

    const bw = Math.max(2, x1 - x0);
    const isSel = i === sel;
    const isLive = now >= c.start && now < c.end;

    ctx.fillStyle = isLive ? C.live : isSel ? C.sel : C.block;
    ctx.globalAlpha = isLive || isSel ? 0.92 : 0.8;
    ctx.fillRect(x0, by, bw, BLOCK_H);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = isLive ? C.liveEdge : isSel ? C.selEdge : C.blockEdge;
    ctx.strokeRect(Math.round(x0) + 0.5, by + 0.5, Math.round(bw) - 1, BLOCK_H - 1);

    if (bw > 26) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0 + 3, by, bw - 6, BLOCK_H);
      ctx.clip();
      ctx.fillStyle = isLive || isSel ? C.onBlockText : C.blockText;
      ctx.font = '10px "Archivo",sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(c.text.replace(/\n/g, ' ') || '(empty)', x0 + 5, by + BLOCK_H / 2 + 0.5);
      ctx.restore();
    }
  });

  /* playhead */
  const px = Math.round(x(now)) + 0.5;
  ctx.strokeStyle = C.playhead;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(px, 0);
  ctx.lineTo(px, h);
  ctx.stroke();
  ctx.fillStyle = C.playhead;
  ctx.beginPath();
  ctx.moveTo(px - 4, 0);
  ctx.lineTo(px + 4, 0);
  ctx.lineTo(px, 6);
  ctx.closePath();
  ctx.fill();
}

export type BlockHit = { index: number; mode: 'move' | 'start' | 'end' } | null;

/**
 * Which cue block, if any, is under a pointer at time `t`. Only the bottom
 * band is interactive; anywhere else on the timeline is a scrub.
 */
export function hitTestBlocks(cues: Cue[], t: number, pxPerSecond: number): BlockHit {
  const slop = 4 / pxPerSecond;
  // Back to front, so the topmost block of an overlapping pair wins.
  for (let i = cues.length - 1; i >= 0; i--) {
    const c = cues[i] as Cue;
    if (t >= c.start - slop && t <= c.end + slop) {
      const mode =
        (t - c.start) * pxPerSecond < EDGE_GRAB
          ? 'start'
          : (c.end - t) * pxPerSecond < EDGE_GRAB
            ? 'end'
            : 'move';
      return { index: i, mode };
    }
  }
  return null;
}
