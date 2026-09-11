import { tc } from '../lib/timecode';
import { megabytes } from '../lib/util';
import { useStore } from '../state/store';
import css from './Header.module.css';

export function Header({ onPick }: { onPick: () => void }) {
  const file = useStore((s) => s.file);
  const ready = useStore((s) => s.ready);
  const loading = useStore((s) => s.loading);
  const dur = useStore((s) => s.dur);
  const vw = useStore((s) => s.vw);
  const vh = useStore((s) => s.vh);

  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const setShortcuts = useStore((s) => s.setShortcuts);
  const setAbout = useStore((s) => s.setAbout);

  const meta = !file
    ? ''
    : loading
      ? `${megabytes(file.size)} · loading…`
      : ready
        ? `${megabytes(file.size)} · ${vw}×${vh} · ${tc(dur, '.', false)}`
        : megabytes(file.size);

  return (
    <header className={css.header}>
      <div className={css.brand}>
        <b>
          SUB<i>DECK</i>
        </b>
        <span>caption bay</span>
      </div>

      <button
        type="button"
        className={`${css.slot} ${ready ? css.live : ''}`}
        onClick={onPick}
        title="Click to load a different video"
      >
        <span className={css.dot} />
        <span className={css.fname}>{file?.name ?? 'no source loaded'}</span>
        <span className={css.meta}>{meta}</span>
      </button>

      <button type="button" className={css.icon} onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
        ↶
      </button>
      <button type="button" className={css.icon} onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
        ↷
      </button>

      <button type="button" className="btn ghost" onClick={onPick}>
        Open video
      </button>
      <button type="button" className={css.icon} onClick={() => setShortcuts(true)} title="Keyboard shortcuts">
        ⌘
      </button>
      <button type="button" className={css.icon} onClick={() => setAbout(true)} title="About Subdeck">
        i
      </button>
    </header>
  );
}
