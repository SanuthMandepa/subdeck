import { memo, useEffect, useRef, useState } from 'react';
import { video } from '../engine/media';
import { tc } from '../lib/timecode';
import { parseTC } from '../lib/timecode';
import type { Cue } from '../lib/types';
import { retextCue } from '../lib/words';
import { snap } from '../state/store';
import css from './CuePanel.module.css';

export interface CueRowProps {
  cue: Cue;
  index: number;
  selected: boolean;
  live: boolean;
  /** Starts before the previous cue ends, or has no length at all. */
  bad: boolean;
  focusMe: boolean;
  onSelect: (index: number) => void;
}

/**
 * One cue.
 *
 * Keyed by `cue.id` in the list above, which is what stops a retime from
 * yanking focus out of the box you are typing in: React keeps the same DOM
 * node when the cue changes position after a sort.
 */
export const CueRow = memo(function CueRow({
  cue,
  index,
  selected,
  live,
  bad,
  focusMe,
  onSelect,
}: CueRowProps) {
  const row = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // Timecode boxes stay uncontrolled while focused so the caret does not jump;
  // they commit on blur or Enter and re-sync from the cue otherwise.
  const [startText, setStartText] = useState(() => tc(cue.start, ','));
  const [endText, setEndText] = useState(() => tc(cue.end, ','));
  const editing = useRef<'start' | 'end' | null>(null);

  useEffect(() => {
    if (editing.current !== 'start') setStartText(tc(cue.start, ','));
    if (editing.current !== 'end') setEndText(tc(cue.end, ','));
  }, [cue.start, cue.end]);

  useEffect(() => {
    if (!focusMe) return;
    textRef.current?.focus();
    row.current?.scrollIntoView({ block: 'center' });
    snap().setFocus(null);
  }, [focusMe]);

  /* Follow the playhead, but never fight the user for the scroll position. */
  useEffect(() => {
    if (!live || video.paused) return;
    const el = row.current;
    const box = el?.parentElement?.parentElement;
    if (!el || !box) return;
    if (box.contains(document.activeElement)) return;
    const r = el.getBoundingClientRect();
    const br = box.getBoundingClientRect();
    if (r.top < br.top + 10 || r.bottom > br.bottom - 10) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [live]);

  const commitTime = (key: 'start' | 'end', raw: string) => {
    editing.current = null;
    const v = parseTC(raw);
    if (v === null) {
      setStartText(tc(cue.start, ','));
      setEndText(tc(cue.end, ','));
      return snap().notify('Use HH:MM:SS,mmm', true);
    }
    snap().retime(cue.id, { [key]: v });
  };

  const className = [css.cue, selected && css.sel, live && css.live, bad && css.bad]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={row}
      className={className}
      onPointerDown={() => onSelect(index)}
      onDoubleClick={(e) => {
        if (!(e.target as HTMLElement).closest('input,textarea,button')) {
          video.currentTime = cue.start + 0.01;
        }
      }}
    >
      <div className={css.top}>
        <span className={css.num}>{String(index + 1).padStart(2, '0')}</span>

        <input
          className={`${css.time} mono`}
          value={startText}
          aria-label={`Cue ${index + 1} start`}
          onFocus={() => (editing.current = 'start')}
          onChange={(e) => setStartText(e.target.value)}
          onBlur={(e) => commitTime('start', e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        <span className={css.arrow}>▸</span>
        <input
          className={`${css.time} mono`}
          value={endText}
          aria-label={`Cue ${index + 1} end`}
          onFocus={() => (editing.current = 'end')}
          onChange={(e) => setEndText(e.target.value)}
          onBlur={(e) => commitTime('end', e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />

        {cue.words ? (
          <span className={css.wordTag} title="has word-level timing">
            ◆ words
          </span>
        ) : (
          <span className={css.dur}>{(cue.end - cue.start).toFixed(2)}s</span>
        )}

        <span className={css.acts}>
          <button
            type="button"
            className={css.icb}
            title="Play this cue"
            onClick={() => {
              video.currentTime = cue.start + 0.01;
              void video.play().catch(() => {});
            }}
          >
            ▶
          </button>
          <button
            type="button"
            className={css.icb}
            title="Split at the playhead (S)"
            onClick={() => {
              if (!snap().splitAt(cue.id, video.currentTime)) {
                snap().notify('Move the playhead inside the cue first', true);
              }
            }}
          >
            ⑂
          </button>
          <button
            type="button"
            className={css.icb}
            title="Merge with the next cue"
            onClick={() => {
              if (!snap().mergeNext(cue.id)) snap().notify('Nothing after this one', true);
            }}
          >
            ⇊
          </button>
          <button
            type="button"
            className={`${css.icb} ${css.del}`}
            title="Delete"
            onClick={() => snap().removeCue(cue.id)}
          >
            ✕
          </button>
        </span>
      </div>

      <textarea
        ref={textRef}
        rows={2}
        spellCheck
        value={cue.text}
        aria-label={`Cue ${index + 1} text`}
        onChange={(e) => {
          const next = retextCue(cue, e.target.value);
          snap().updateCue(cue.id, { text: next.text, words: next.words });
        }}
        onKeyDown={(e) => {
          if (e.key === 'Tab' && !e.shiftKey) {
            const nxt = row.current?.nextElementSibling?.querySelector('textarea');
            if (nxt) {
              e.preventDefault();
              (nxt as HTMLTextAreaElement).focus();
            }
          }
        }}
      />

      {bad && <div className={css.warn}>▲ out of order or zero length</div>}
    </div>
  );
});
