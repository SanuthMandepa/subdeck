import { describe, expect, it } from 'vitest';
import { parseSubs, toSRT, toTranscript, toVTT } from './subtitles';
import type { Cue } from './types';

const cue = (start: number, end: number, text: string): Cue => ({
  id: `${start}`,
  start,
  end,
  text,
  words: null,
});

describe('toSRT', () => {
  it('numbers cues from one and uses comma separators', () => {
    expect(toSRT([cue(0, 1.5, 'Hello')])).toBe('1\n00:00:00,000 --> 00:00:01,500\nHello\n');
  });

  it('substitutes a placeholder rather than writing an empty cue', () => {
    expect(toSRT([cue(0, 1, '   ')])).toContain('…');
  });
});

describe('toVTT', () => {
  it('leads with the WEBVTT header and uses dot separators', () => {
    const out = toVTT([cue(0, 1.5, 'Hello')]);
    expect(out.startsWith('WEBVTT\n\n')).toBe(true);
    expect(out).toContain('00:00:00.000 --> 00:00:01.500');
  });
});

describe('toTranscript', () => {
  it('flattens each cue onto one line', () => {
    expect(toTranscript([cue(0, 1, 'two\nlines'), cue(1, 2, 'next')])).toBe('two lines\nnext');
  });
});

describe('parseSubs', () => {
  it('round-trips what toSRT writes', () => {
    const original = [cue(0, 1.5, 'First line'), cue(2, 3.25, 'Second line')];
    const parsed = parseSubs(toSRT(original));
    expect(parsed).toHaveLength(2);
    expect(parsed[0]?.start).toBeCloseTo(0);
    expect(parsed[0]?.end).toBeCloseTo(1.5);
    expect(parsed[0]?.text).toBe('First line');
    expect(parsed[1]?.text).toBe('Second line');
  });

  it('round-trips what toVTT writes', () => {
    const parsed = parseSubs(toVTT([cue(1, 2, 'Hello there')]));
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.text).toBe('Hello there');
  });

  it('keeps multi-line cue text', () => {
    const parsed = parseSubs('1\n00:00:00,000 --> 00:00:02,000\nline one\nline two\n');
    expect(parsed[0]?.text).toBe('line one\nline two');
  });

  it('strips markup tags', () => {
    const parsed = parseSubs('1\n00:00:00,000 --> 00:00:02,000\n<i>slanted</i> text\n');
    expect(parsed[0]?.text).toBe('slanted text');
  });

  it('ignores a byte-order mark and CRLF line endings', () => {
    const parsed = parseSubs('﻿1\r\n00:00:00,000 --> 00:00:02,000\r\nHello\r\n');
    expect(parsed[0]?.text).toBe('Hello');
  });

  it('tolerates VTT cue settings after the timestamps', () => {
    const parsed = parseSubs('WEBVTT\n\n00:00:00.000 --> 00:00:02.000 line:90% align:start\nHi\n');
    expect(parsed[0]?.text).toBe('Hi');
  });

  it('never produces a zero-length cue', () => {
    const parsed = parseSubs('1\n00:00:05,000 --> 00:00:05,000\nInstant\n');
    expect(parsed[0]?.end).toBeGreaterThan(parsed[0]?.start ?? 0);
  });

  it('returns nothing for a file with no cues', () => {
    expect(parseSubs('just some prose')).toEqual([]);
  });

  it('starts a fresh scan each call rather than resuming the last one', () => {
    const srt = toSRT([cue(0, 1, 'One'), cue(1, 2, 'Two')]);
    expect(parseSubs(srt)).toHaveLength(2);
    expect(parseSubs(srt)).toHaveLength(2);
  });
});
