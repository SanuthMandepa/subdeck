import { useCallback, useEffect, useRef, useState } from 'react';
import { getCapBox, paintPreview, registerPreview } from '../engine/loop';
import { clamp } from '../lib/util';
import { useStore } from '../state/store';
import css from './Stage.module.css';

/** How the caption was placed when the drag began, so Escape can put it back. */
interface CapDrag {
  px: number;
  py: number;
  bottom: number;
  xOffset: number;
  pointerId: number;
}

export function Stage({ dragging, onPick }: { dragging: boolean; onPick: () => void }) {
  const ready = useStore((s) => s.ready);
  const vw = useStore((s) => s.vw);
  const vh = useStore((s) => s.vh);
  const recording = useStore((s) => s.recording);
  const setStyle = useStore((s) => s.setStyle);

  const cvRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<CapDrag | null>(null);
  const [overCaption, setOverCaption] = useState(false);

  /* Hand the canvas to the render loop for as long as it is mounted. */
  useEffect(() => {
    const cv = cvRef.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    registerPreview({ cv, ctx });
    return () => registerPreview(null);
  }, []);

  /* Match the backing store to the source, then repaint immediately: with the
     video paused there is no other event that would refresh it. */
  useEffect(() => {
    const cv = cvRef.current;
    if (!cv || !ready) return;
    cv.width = vw;
    cv.height = vh;
    paintPreview();
  }, [ready, vw, vh]);

  /** Pointer position in frame pixels, which is what capBox is measured in. */
  const framePoint = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const cv = cvRef.current;
    if (!cv) return { x: 0, y: 0 };
    const r = cv.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * cv.width,
      y: ((e.clientY - r.top) / r.height) * cv.height,
    };
  }, []);

  const overCap = useCallback(
    (p: { x: number; y: number }) => {
      const b = getCapBox();
      return !!b && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
    },
    [],
  );

  const endDrag = useCallback(
    (commit: boolean) => {
      const d = drag.current;
      if (!d) return;
      drag.current = null;
      if (!commit) setStyle({ bottom: d.bottom, xOffset: d.xOffset });
      try {
        cvRef.current?.releasePointerCapture(d.pointerId);
      } catch {
        /* the capture is already gone */
      }
      paintPreview();
    },
    [setStyle],
  );

  /* Escape cancels, and so does the window losing the pointer entirely —
     without these a drag keeps following the mouse after you leave the canvas. */
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
    if (!ready || drag.current || recording) return;
    const p = framePoint(e);
    if (!overCap(p)) return;
    e.preventDefault();
    const { bottom, xOffset } = useStore.getState().style;
    drag.current = { px: p.x, py: p.y, bottom, xOffset, pointerId: e.pointerId };
    cvRef.current?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!ready) return;
    const d = drag.current;
    const cv = cvRef.current;
    if (!d || !cv) {
      setOverCaption(overCap(framePoint(e)));
      return;
    }
    if (e.buttons === 0) return endDrag(true);

    const p = framePoint(e);
    setStyle({
      xOffset: clamp(d.xOffset + ((p.x - d.px) / cv.width) * 100, -45, 45),
      bottom: clamp(d.bottom - ((p.y - d.py) / cv.height) * 100, 0, 92),
    });
    paintPreview();
  };

  const cursor = drag.current ? css.grabbing : overCaption ? css.grab : '';

  return (
    <div className={`${css.screen} ${dragging ? css.dragging : ''}`}>
      <canvas
        ref={cvRef}
        className={`${css.canvas} ${cursor}`}
        hidden={!ready}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onLostPointerCapture={() => endDrag(true)}
      />

      {!ready && (
        <div className={css.empty}>
          <div className={css.dropzone}>
            <div className={css.reel}>
              {Array.from({ length: 7 }, (_, i) => (
                <i key={i} />
              ))}
            </div>
            <h1>Drop a video here</h1>
            <p>Transcribe it, edit every line, and export subtitles or a captioned video.</p>
            <button type="button" className="btn amber" onClick={onPick}>
              Choose a file
            </button>
            <div className={css.privacy}>
              <b>●</b> everything runs inside your browser
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
