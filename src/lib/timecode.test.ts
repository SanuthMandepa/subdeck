import { describe, expect, it } from 'vitest';
import { parseTC, tc } from './timecode';

describe('tc', () => {
  it('formats hours, minutes, seconds and milliseconds', () => {
    expect(tc(0)).toBe('00:00:00.000');
    expect(tc(3661.5)).toBe('01:01:01.500');
    expect(tc(59.999)).toBe('00:00:59.999');
  });

  it('uses the separator SubRip wants', () => {
    expect(tc(1.25, ',')).toBe('00:00:01,250');
  });

  it('drops milliseconds on request', () => {
    expect(tc(125, '.', false)).toBe('00:02:05');
  });

  it('clamps negatives rather than emitting a broken timecode', () => {
    expect(tc(-5)).toBe('00:00:00.000');
  });

  it('truncates rather than rounds, so a cue never gains a frame', () => {
    expect(tc(0.9999)).toBe('00:00:00.999');
  });
});

describe('parseTC', () => {
  it('reads both separators', () => {
    expect(parseTC('00:00:01,250')).toBeCloseTo(1.25);
    expect(parseTC('00:00:01.250')).toBeCloseTo(1.25);
  });

  it('reads a timecode with no hours', () => {
    expect(parseTC('02:05.500')).toBeCloseTo(125.5);
  });

  it('reads hours past 24', () => {
    expect(parseTC('100:00:00')).toBe(360_000);
  });

  it('pads a short fraction the way a human means it', () => {
    expect(parseTC('00:00:01.5')).toBeCloseTo(1.5);
    expect(parseTC('00:00:01.05')).toBeCloseTo(1.05);
  });

  it('falls back to a bare number of seconds', () => {
    expect(parseTC('12.5')).toBeCloseTo(12.5);
  });

  it('returns null for junk, so the caller can reject the edit', () => {
    expect(parseTC('not a time')).toBeNull();
    expect(parseTC('')).toBeNull();
    expect(parseTC(null)).toBeNull();
  });

  it('round-trips through tc', () => {
    for (const t of [0, 1.234, 61.5, 3725.125]) {
      expect(parseTC(tc(t, ','))).toBeCloseTo(t, 3);
    }
  });
});
