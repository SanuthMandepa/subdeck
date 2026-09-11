import { useEffect, useRef, type ReactNode } from 'react';
import css from './controls.module.css';

/**
 * A dialog that traps focus and closes on Escape or a backdrop click.
 *
 * This is what replaced `window.confirm` for destructive actions: a native
 * confirm blocks the whole page, cannot be styled, and on some platforms is
 * suppressed entirely after a few uses.
 */
export function Modal({
  title,
  onClose,
  children,
  footer,
  labelledBy = 'modal-title',
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  labelledBy?: string;
}) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = box.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    first?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !box.current) return;
      const nodes = [
        ...box.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
      ];
      if (!nodes.length) return;
      const head = nodes[0] as HTMLElement;
      const tail = nodes[nodes.length - 1] as HTMLElement;
      if (e.shiftKey && document.activeElement === head) {
        e.preventDefault();
        tail.focus();
      } else if (!e.shiftKey && document.activeElement === tail) {
        e.preventDefault();
        head.focus();
      }
    };

    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      previous?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className={css.backdrop}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={css.box} ref={box} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        <h2 id={labelledBy}>{title}</h2>
        <div className={css.body}>{children}</div>
        <div className={css.foot}>
          {footer ?? (
            <button type="button" className="btn ghost" onClick={onClose}>
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
