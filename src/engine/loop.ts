/**
 * The single render loop.
 *
 * One rAF drives the preview canvas, the timeline canvas and the timecode
 * readout. Components register their canvas on mount rather than each running
 * a loop of their own, which is both cheaper and keeps the two canvases
 * showing the same instant.
 *
 * Nothing here calls setState per frame. The timecode is written straight to a
 * DOM node's textContent, and the store is only touched when something
 * genuinely changed — the live cue index, or the scroll position of a zoomed
 * timeline.
 */
import { tc } from '../lib/timecode';
import type { CapBox } from '../lib/types';
import { clamp } from '../lib/util';
import { snap } from '../state/store';
import { cueAt, drawFrame } from './caption';
import { video } from './media';
import { drawTimeline, viewRange } from './timeline';

type Surface = { cv: HTMLCanvasElement; ctx: CanvasRenderingContext2D };

let preview: Surface | null = null;
let strip: Surface | null = null;
let clock: HTMLElement | null = null;
let capBox: CapBox | null = null;
let running = false;
let raf = 0;

export const registerPreview = (s: Surface | null): void => void (preview = s);
export const registerStrip = (s: Surface | null): void => void (strip = s);
export const registerClock = (el: HTMLElement | null): void => void (clock = el);

/** Bounds of the caption as last painted, for drag-to-position hit testing. */
export const getCapBox = (): CapBox | null => capBox;

/** Repaint the preview once, outside the loop — after a style edit while paused. */
export function paintPreview(): void {
  const s = snap();
  if (!preview || !s.ready) return;
  capBox = drawFrame(preview.ctx, preview.cv.width, preview.cv.height, video.currentTime, {
    source: video,
    cues: s.cues,
    style: s.style,
  });
}

export function paintStrip(): void {
  const s = snap();
  if (!strip) return;
  drawTimeline(strip.cv, strip.ctx, {
    cues: s.cues,
    sel: s.sel,
    peaks: s.peaks,
    dur: s.dur,
    zoom: s.zoom,
    view: s.view,
    now: video.currentTime,
    ready: s.ready,
  });
}

/** Keep a zoomed timeline scrolled so the playhead stays in the middle band. */
function followPlayhead(): void {
  const s = snap();
  if (!s.zoom) return;
  const [a, d] = viewRange(s.zoom, s.view, s.dur);
  const t = video.currentTime;
  if (t < a + d * 0.1 || t > a + d * 0.9) {
    s.setView(clamp(t - d / 2, 0, Math.max(0, s.dur - d)));
  }
}

function frame(): void {
  raf = requestAnimationFrame(frame);
  const s = snap();

  // The exporters drive their own drawing; stay out of their way.
  if (!s.ready || s.recording) return;

  paintPreview();
  paintStrip();

  const now = video.currentTime;
  if (clock) clock.textContent = tc(now);

  const live = cueAt(s.cues, now);
  if (live !== s.liveIndex) s.setLive(live);

  if (!video.paused) followPlayhead();
}

export function startLoop(): void {
  if (running) return;
  running = true;
  raf = requestAnimationFrame(frame);
}

export function stopLoop(): void {
  running = false;
  cancelAnimationFrame(raf);
}
