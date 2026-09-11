import { useEffect, useRef, useState } from 'react';
import { registerClock } from '../engine/loop';
import { video } from '../engine/media';
import { tc } from '../lib/timecode';
import { useStore } from '../state/store';
import { useEditorActions } from '../hooks/useEditorActions';
import css from './Transport.module.css';

const ICON_PLAY = 'M8 5v14l11-7z';
const ICON_PAUSE = 'M6 5h4v14H6zm8 0h4v14h-4z';

export function Transport() {
  const ready = useStore((s) => s.ready);
  const dur = useStore((s) => s.dur);
  const hasSel = useStore((s) => s.sel >= 0);
  const { togglePlay, nudge, newCue, setIn, setOut, setVol, setRate } = useEditorActions();

  const clockRef = useRef<HTMLSpanElement>(null);
  const [paused, setPaused] = useState(true);
  const [volume, setVolume] = useState(1);
  const [rate, setRateValue] = useState('1');

  useEffect(() => {
    registerClock(clockRef.current);
    return () => registerClock(null);
  }, []);

  useEffect(() => {
    const sync = () => setPaused(video.paused);
    video.addEventListener('play', sync);
    video.addEventListener('pause', sync);
    video.addEventListener('ended', sync);
    return () => {
      video.removeEventListener('play', sync);
      video.removeEventListener('pause', sync);
      video.removeEventListener('ended', sync);
    };
  }, []);

  return (
    <div className={css.transport}>
      <button
        type="button"
        className={`${css.tbtn} ${css.play}`}
        onClick={togglePlay}
        disabled={!ready}
        title="Play / pause (Space)"
        aria-label={paused ? 'Play' : 'Pause'}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d={paused ? ICON_PLAY : ICON_PAUSE} />
        </svg>
      </button>

      <button type="button" className={css.tbtn} onClick={() => nudge(-5)} disabled={!ready} title="Back 5s">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z" />
        </svg>
      </button>
      <button type="button" className={css.tbtn} onClick={() => nudge(5)} disabled={!ready} title="Forward 5s">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" />
        </svg>
      </button>

      <div className={css.clock}>
        <span ref={clockRef}>00:00:00.000</span>
        <small> / {tc(dur, '.', false)}</small>
      </div>

      <button type="button" className="btn ghost sm" onClick={newCue} disabled={!ready} title="New cue at the playhead (N)">
        + Cue
      </button>
      <button type="button" className="btn ghost sm" onClick={setIn} disabled={!hasSel} title="Set the selected cue's in point ([)">
        Set in
      </button>
      <button type="button" className="btn ghost sm" onClick={setOut} disabled={!hasSel} title="Set the selected cue's out point (])">
        Set out
      </button>

      <div className={css.spacer} />

      <span className="lbl">Rate</span>
      <select
        className={css.rate}
        value={rate}
        aria-label="Playback rate"
        onChange={(e) => {
          setRateValue(e.target.value);
          setRate(Number(e.target.value));
        }}
      >
        {['0.5', '0.75', '1', '1.25', '1.5', '2'].map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>

      <div className={css.vol}>
        <span className="lbl">Vol</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          aria-label="Volume"
          onChange={(e) => {
            const v = Number(e.target.value);
            setVolume(v);
            setVol(v);
          }}
        />
      </div>
    </div>
  );
}
