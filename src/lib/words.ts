import type { Cue, Word } from './types';
import { clamp, uid } from './util';

/**
 * Cues may carry explicit per-word timings (from Whisper's word-level mode).
 * When they don't, synthesise them by splitting the cue's span across its
 * words weighted by length — good enough to drive the word-pop animation on
 * hand-typed captions.
 */
export function cueWords(c: Cue): Word[] {
  if (c.words && c.words.length) return c.words;
  const parts = String(c.text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return [];
  const span = Math.max(0.05, c.end - c.start);
  const weight = parts.reduce((a, w) => a + w.length + 1, 0);
  let t = c.start;
  return parts.map((w) => {
    const d = span * ((w.length + 1) / weight);
    const o: Word = { w, t, d };
    t += d;
    return o;
  });
}

/**
 * Retext a cue without destroying good word timings: if the word count still
 * matches, just re-label them. Returns a new cue rather than mutating.
 */
export function retextCue(c: Cue, text: string): Cue {
  if (!c.words) return { ...c, text };
  const parts = text.trim().split(/\s+/).filter(Boolean);
  if (parts.length === c.words.length) {
    const words = c.words.map((o, i) => ({ ...o, w: parts[i] as string }));
    return { ...c, text, words };
  }
  return { ...c, text, words: null };
}

/**
 * Keep word timings proportional when a cue is retimed. `prev` is the cue's
 * span before the edit; `next` already carries the new start/end.
 */
export function shiftWords(next: Cue, prev: { start: number; end: number }): Cue {
  if (!next.words || !next.words.length) return next;
  const os = prev.end - prev.start;
  if (os <= 0) return { ...next, words: null };
  const k = (next.end - next.start) / os;
  const words = next.words.map((o) => ({
    ...o,
    t: next.start + (o.t - prev.start) * k,
    d: o.d * k,
  }));
  return { ...next, words };
}

/** Group Whisper's flat word stream into readable lines. */
export function wordsToCues(words: Word[], perLine: number): Cue[] {
  const cues: Cue[] = [];
  let cur: Word[] = [];

  const flush = () => {
    if (!cur.length) return;
    const first = cur[0] as Word;
    const last = cur[cur.length - 1] as Word;
    cues.push({
      id: uid(),
      start: first.t,
      end: last.t + last.d,
      text: cur.map((o) => o.w).join(' '),
      words: cur,
    });
    cur = [];
  };

  words.forEach((o, i) => {
    cur.push(o);
    const nxt = words[i + 1];
    const gap = nxt ? nxt.t - (o.t + o.d) : Infinity;
    const span = o.t + o.d - (cur[0] as Word).t;
    const sentenceEnd = /[.!?…]["')\]]?$/.test(o.w);
    if (cur.length >= perLine || gap > 0.7 || span > 4.5 || (sentenceEnd && cur.length >= 2)) flush();
  });
  flush();
  return cues;
}

/**
 * Split a cue at time `t`. Prefers the real word timings when the cue has
 * them, and otherwise apportions the text by position within the span.
 * Returns null when the playhead is not usefully inside the cue.
 */
export function splitCueAt(c: Cue, t: number): [Cue, Cue] | null {
  if (t <= c.start + 0.05 || t >= c.end - 0.05) return null;

  let aTxt: string;
  let bTxt: string;
  let aW: Word[] | null = null;
  let bW: Word[] | null = null;

  if (c.words && c.words.length) {
    aW = c.words.filter((o) => o.t < t);
    bW = c.words.filter((o) => o.t >= t);
    aTxt = aW.map((o) => o.w).join(' ');
    bTxt = bW.map((o) => o.w).join(' ');
    if (!aW.length) aW = null;
    if (!bW.length) bW = null;
  } else {
    const words = c.text.trim().split(/\s+/).filter(Boolean);
    const k = clamp(Math.round((words.length * (t - c.start)) / (c.end - c.start)), 0, words.length);
    aTxt = words.slice(0, k).join(' ');
    bTxt = words.slice(k).join(' ');
  }

  return [
    { ...c, end: t, text: aTxt, words: aW },
    { id: uid(), start: t, end: c.end, text: bTxt, words: bW },
  ];
}

/** Merge `b` into `a`. Word timings survive only if both sides have them. */
export function mergeCues(a: Cue, b: Cue): Cue {
  return {
    ...a,
    end: b.end,
    text: `${a.text.trim()} ${b.text.trim()}`.trim(),
    words: a.words && b.words ? [...a.words, ...b.words] : null,
  };
}
