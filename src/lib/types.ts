/** One word with its own timing, in seconds. */
export interface Word {
  /** The word itself. */
  w: string;
  /** Start time, seconds from the top of the file. */
  t: number;
  /** Duration, seconds. */
  d: number;
}

export interface Cue {
  id: string;
  start: number;
  end: number;
  text: string;
  /**
   * Per-word timings from Whisper's word-level mode. `null` means we have none
   * and have to synthesise them — see `cueWords`.
   */
  words: Word[] | null;
}

export type CaptionMode = 'classic' | 'pop';
export type Align = 'left' | 'center' | 'right';

export interface CaptionStyle {
  mode: CaptionMode;

  font: string;
  size: number;
  weight: number;
  upper: boolean;

  color: string;
  outline: number;
  outlineColor: string;
  box: number;
  boxColor: string;
  shadow: boolean;

  bottom: number;
  xOffset: number;
  width: number;
  align: Align;
  lineGap: number;

  // word-pop only
  palette: string[];
  rise: number;
  animMs: number;
  ghost: number;
  popScale: number;
  perLineColor: boolean;
}

/** Bounds of the last painted caption, in frame pixels, for drag-to-position. */
export interface CapBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ExportEngine = 'precise' | 'realtime';

export interface AsrPrefs {
  model: string;
  lang: string;
  translate: boolean;
  gpu: boolean;
  words: boolean;
  perLine: number;
}

export interface ExportPrefs {
  engine: ExportEngine;
  scale: number;
  fps: number;
  bitrate: number;
}

/** Progress readout shared by transcription and burn-in. */
export interface JobStatus {
  active: boolean;
  msg: string;
  /** 0-100, or null for an indeterminate step. */
  pct: number | null;
  sub: string;
  cancellable: boolean;
  /** Paints the progress bar red — used while encoding. */
  recording: boolean;
}
