import { parseTC, tc } from './timecode';
import type { Cue } from './types';
import { uid } from './util';

export function toSRT(cues: Cue[]): string {
  return cues
    .map((c, i) => `${i + 1}\n${tc(c.start, ',')} --> ${tc(c.end, ',')}\n${c.text.trim() || '…'}\n`)
    .join('\n');
}

export function toVTT(cues: Cue[]): string {
  return (
    'WEBVTT\n\n' +
    cues
      .map((c, i) => `${i + 1}\n${tc(c.start, '.')} --> ${tc(c.end, '.')}\n${c.text.trim() || '…'}\n`)
      .join('\n')
  );
}

export function toTranscript(cues: Cue[]): string {
  return cues.map((c) => c.text.replace(/\n/g, ' ').trim()).join('\n');
}

const CUE_RE =
  /(\d{1,3}:\d{2}:\d{2}[.,]\d{1,3}|\d{1,2}:\d{2}[.,]\d{1,3})\s*-->\s*(\d{1,3}:\d{2}:\d{2}[.,]\d{1,3}|\d{1,2}:\d{2}[.,]\d{1,3})[^\n]*\n([\s\S]*?)(?=\n\s*\n|\n\s*\d+\s*\n\s*\d{1,3}:|$)/g;

/** Parse SubRip or WebVTT. Tolerant: unknown cue settings and tags are dropped. */
export function parseSubs(txt: string): Cue[] {
  // Strip a leading byte-order mark; some editors add one to .srt files.
  const clean = (txt.charCodeAt(0) === 0xfeff ? txt.slice(1) : txt).replace(/\r/g, '');
  const out: Cue[] = [];
  const re = new RegExp(CUE_RE.source, 'g');
  let m: RegExpExecArray | null;

  while ((m = re.exec(clean))) {
    const s = parseTC(m[1]);
    const e = parseTC(m[2]);
    if (s === null || e === null) continue;
    const text = (m[3] ?? '')
      .split('\n')
      .filter((l) => !/^\s*\d+\s*$/.test(l))
      .join('\n')
      .replace(/<[^>]+>/g, '')
      .trim();
    out.push({ id: uid(), start: s, end: Math.max(e, s + 0.1), text, words: null });
  }
  return out;
}
