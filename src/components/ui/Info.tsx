import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import css from './controls.module.css';

/**
 * A small `i` that opens a popover.
 *
 * The panels used to carry paragraphs of explanation inline, which made every
 * screen look busier than it is. The words are all still here — they are just
 * one click away instead of permanently in the way.
 */
export function Info({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return (
    <span className={css.infoWrap} ref={wrap}>
      <button
        type="button"
        className={`${css.infoBtn} ${open ? css.open : ''}`}
        aria-expanded={open}
        aria-controls={id}
        aria-label={`About ${label}`}
        onClick={() => setOpen((v) => !v)}
      >
        i
      </button>
      {open && (
        <span className={css.pop} id={id} role="note">
          {children}
        </span>
      )}
    </span>
  );
}
