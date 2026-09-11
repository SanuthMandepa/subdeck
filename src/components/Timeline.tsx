import { useCallback, useEffect, useRef, useState } from 'react';
import { paintPreview, paintStrip, registerStrip } from '../engine/loop';
import { video } from '../engine/media';
import { BAND_H, hitTestBlocks, viewRange } from '../engine/timeline';
import type { Cue, Word } from '../lib/types';
import { clamp } from '../lib/util';
import { shiftWords } from '../lib/words';
import { snap, useStore } from '../state/store';
import { useEditorActions } from '../hooks/useEditorActions';
import css from './Timeline.module.css';

const ZOOMS: ReadonlyArray<[number, string]> = [
  [0, 'FIT'],
  [120, '120s'],
  [40, '40s'],
  [12, '12s'],
];

/** Minimum a cue can be shortened to by dragging, in seconds. */
const MIN_SPAN = 0.15;

type Drag =
  | { kind: 'seek'; pointerId: number }
  | {
      kind: 'cue';
      pointerId: number;
      index: number;
      mode: 'move' | 'start' | 'end';
      grabT: number;
      start0: number;
      end0: number;
      words0: Word[] | null;
    };

export function Timeline() {
  const ready = useStore((s) => s.ready);
  const zoom = useStore((s) => s.zoom);
  const { seek } = useEditorActions();

  const cvRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<Drag | null>(null);
  const [cursor, setCursor] = useState('crosshair');

  useEffect(() => {
    const cv = cvRef.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    registerStrip({ cv, ctx });
    paintStrip();
    return () => registerStrip(null);
  }, []);

  useEffect(() => {
    const onResize = () => paintStrip();
    addEventListener('resize', onResize);
    return () => removeEventListener('resize', onResize);
  }, []);

  /** Time under a pointer, clamped to the visible window. */
  const timeAt = useCallback((clientX: number) => {
    const cv = cvRef.current;
    if (!cv) return 0;
    const r = cv.getBoundingClientRect();
    const s = snap();
    const [a, d] = viewRange(s.zoom, s.view, s.dur);
    return a + clamp((clientX - r.left) / r.width, 0, 1) * d;
  }, []);

  const pxPerSecond = useCallback(() => {
    const cv = cvRef.current;
    if (!cv) return 1;
    const s = snap();
    return cv.getBoundingClientRect().width / viewRange(s.zoom, s.view, s.dur)[1];
  }, []);

  const endDrag = useCallback((commit: boolean) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;

    if (d.kind === 'cue') {
      const s = snap();
      const c = s.cues[d.index];
      if (c) {
        if (commit) {
          // Re-sort and persist only now, so a drag is one history entry.
          s.setCues(s.cues, { select: -1 });
          snap().select(snap().cues.findIndex((x) => x.id === c.id));
        } else {
          s.dragCue(d.index, { start: d.start0, end: d.end0, words: d.words0 });
        }
      }
    }

    try {
      cvRef.current?.releasePointerCapture(d.pointerId);
    } catch {
      /* the capture is already gone */
    }
    setCursor('crosshair');
    paintStrip();
    paintPreview();
  }, []);

  /* A drag has to end on every way out, not just pointerup — otherwise it
     keeps tracking the mouse after the pointer leaves the window. */
  useEffect(() => {
    const up = () => endDrag(true);
    const cancel = () => endDrag(false);
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && drag.current) {
        e.stopPropagation();
        endDrag(false);
      }
    };
    addEventListener('pointerup', up);
    addEventListener('pointercancel', cancel);
    addEventListener('blur', up);
    addEventListener('keydown', key, true);
    return () => {
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', cancel);
      removeEventListener('blur', up);
      removeEventListener('keydown', key, true);
    };
  }, [endDrag]);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cv = cvRef.current;
    if (!ready || drag.current || !cv) return;

    const r = cv.getBoundingClientRect();
    const t = timeAt(e.clientX);
    const s = snap();

    // Only the bottom band holds cue blocks; the rest of the strip scrubs.
    if (e.clientY - r.top > r.height - BAND_H) {
      const hit = hitTestBlocks(s.cues, t, pxPerSecond());
      if (hit) {
        const c = s.cues[hit.index] as Cue;
        drag.current = {
          kind: 'cue',
          pointerId: e.pointerId,
          index: hit.index,
          mode: hit.mode,
          grabT: t,
          start0: c.start,
          end0: c.end,
          words0: c.words ? c.words.map((o) => ({ ...o })) : null,
        };
        s.commit();
        s.select(hit.index);
        cv.setPointerCapture(e.pointerId);
        setCursor(hit.mode === 'move' ? 'grabbing' : 'ew-resize');
        return;
      }
    }

    drag.current = { kind: 'seek', pointerId: e.pointerId };
    cv.setPointerCapture(e.pointerId);
    seek(t);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cv = cvRef.current;
    if (!ready || !cv) return;
    const d = drag.current;

    if (!d) {
      const r = cv.getBoundingClientRect();
      let next = 'crosshair';
      if (e.clientY - r.top > r.height - BAND_H) {
        const hit = hitTestBlocks(snap().cues, timeAt(e.clientX), pxPerSecond());
        if (hit) next = hit.mode === 'move' ? 'grab' : 'ew-resize';
      }
      setCursor(next);
      return;
    }

    if (e.buttons === 0) return endDrag(true); // released somewhere else

    const t = timeAt(e.clientX);
    if (d.kind === 'seek') return seek(t);

    const s = snap();
    const dt = t - d.grabT;
    let start = d.start0;
    let end = d.end0;

    if (d.mode === 'move') {
      const len = d.end0 - d.start0;
      start = clamp(d.start0 + dt, 0, Math.max(0, s.dur - len));
      end = start + len;
    } else if (d.mode === 'start') {
      start = clamp(d.start0 + dt, 0, d.end0 - MIN_SPAN);
    } else {
      end = clamp(d.end0 + dt, d.start0 + MIN_SPAN, s.dur);
    }

    let words = d.words0;
    if (words) {
      const retimed = shiftWords(
        { ...(s.cues[d.index] as Cue), start, end, words: words.map((o) => ({ ...o })) },
        { start: d.start0, end: d.end0 },
      );
      words = retimed.words;
    }

    s.dragCue(d.index, { start, end, words });
    paintStrip();
    paintPreview();
  };

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const s = snap();
    if (!s.ready || !s.zoom) return;
    s.setView(clamp(s.view + e.deltaY * 0.003 * s.zoom, 0, Math.max(0, s.dur - s.zoom)));
    paintStrip();
  };

  return (
    <div className={css.tl}>
      <div className={css.head}>
        <span className="lbl">Timeline</span>
        <div className={css.zoom} role="group" aria-label="Timeline zoom">
          {ZOOMS.map(([z, label]) => (
            <button
              key={z}
              type="button"
              className={z === zoom ? css.on : undefined}
              aria-pressed={z === zoom}
              onClick={() => {
                snap().setZoom(z, video.currentTime);
                paintStrip();
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="hint">drag a block to move · drag an edge to trim</span>
      </div>

      <div className={css.wrap}>
        <canvas
          ref={cvRef}
          className={css.canvas}
          style={{ cursor }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onLostPointerCapture={() => endDrag(true)}
          onWheel={onWheel}
        />
      </div>
    </div>
  );
}
