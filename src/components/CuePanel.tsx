import { useRef } from 'react';
import { autoTranscribe } from '../engine/asr';
import { stopBurn } from '../engine/export/burn';
import { importSubtitles } from '../engine/source';
import type { Cue } from '../lib/types';
import { clamp } from '../lib/util';
import { useStore } from '../state/store';
import { AsrSettings } from './AsrSettings';
import { CueRow } from './CueRow';
import css from './CuePanel.module.css';

export function CuePanel() {
  const cues = useStore((s) => s.cues);
  const sel = useStore((s) => s.sel);
  const live = useStore((s) => s.liveIndex);
  const focusId = useStore((s) => s.focusId);
  const transcribing = useStore((s) => s.transcribing);
  const select = useStore((s) => s.select);
  const sortCues = useStore((s) => s.sortCues);
  const clearCues = useStore((s) => s.clearCues);
  const notify = useStore((s) => s.notify);
  const ask = useStore((s) => s.ask);

  const subPick = useRef<HTMLInputElement>(null);

  const onClear = async () => {
    if (!cues.length) return;
    const ok = await ask({
      title: 'Delete every cue?',
      body: `All ${cues.length} cues will be removed. Ctrl+Z brings them back.`,
      confirmLabel: 'Delete all',
      danger: true,
    });
    if (ok) clearCues();
  };

  return (
    <>
      <div className={css.bar}>
        <button
          type="button"
          className="btn amber sm"
          disabled={transcribing}
          onClick={() => void autoTranscribe()}
        >
          ◆ Auto-transcribe
        </button>
        <button type="button" className="btn ghost sm" onClick={() => subPick.current?.click()}>
          Import SRT/VTT
        </button>
        <button type="button" className="btn ghost sm" onClick={sortCues} disabled={!cues.length}>
          Sort
        </button>
        <button type="button" className="btn red sm" onClick={() => void onClear()} disabled={!cues.length}>
          Clear
        </button>
      </div>

      <StatusReadout />

      <div className={css.list}>
        {cues.length === 0 ? (
          <div className={css.blank}>
            <b>NO CUES</b>
            Auto-transcribe, import an <code>.srt</code>, or press <strong>N</strong> to type them
            by hand.
          </div>
        ) : (
          cues.map((c, i) => (
            <CueRow
              key={c.id}
              cue={c}
              index={i}
              selected={i === sel}
              live={i === live}
              bad={isBad(cues, i)}
              focusMe={c.id === focusId}
              onSelect={select}
            />
          ))
        )}
      </div>

      <AsrSettings />

      <input
        ref={subPick}
        type="file"
        accept=".srt,.vtt,text/plain"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void importSubtitles(f).catch(() => notify('Could not read that file', true));
        }}
      />
    </>
  );
}

/** A cue is flagged when it has no length or starts before its predecessor ends. */
function isBad(cues: Cue[], i: number): boolean {
  const c = cues[i] as Cue;
  const prev = cues[i - 1];
  return c.end <= c.start || (!!prev && c.start < prev.end - 0.001);
}

function StatusReadout() {
  const status = useStore((s) => s.status);
  const transcribing = useStore((s) => s.transcribing);
  const recording = useStore((s) => s.recording);
  const requestCancel = useStore((s) => s.requestCancel);
  const notify = useStore((s) => s.notify);

  if (!status.active) return null;

  const onCancel = () => {
    if (recording) return stopBurn();
    if (transcribing) {
      requestCancel();
      notify('Stopping after the current chunk…');
    }
  };

  return (
    <div className={css.status} role="status" aria-live="polite">
      <div className={css.statusTop}>
        <span className={css.statusMsg}>{status.msg}</span>
        <span className={css.statusPct}>
          {status.pct == null ? '' : `${Math.round(status.pct)}%`}
        </span>
      </div>
      <div className={`${css.track} ${status.recording ? css.rec : ''}`}>
        <i style={{ width: `${status.pct == null ? 0 : clamp(status.pct, 0, 100)}%` }} />
      </div>
      {status.sub && <div className={css.statusSub}>{status.sub}</div>}
      {status.cancellable && (
        <div className={css.statusFoot}>
          <button type="button" className="btn ghost sm" onClick={onCancel}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
