import { describe, expect, it } from 'vitest';
import type { Cue, Word } from './types';
import { cueWords, mergeCues, retextCue, shiftWords, splitCueAt, wordsToCues } from './words';

const cue = (over: Partial<Cue> = {}): Cue => ({
  id: 'c1',
  start: 0,
  end: 4,
  text: 'one two three',
  words: null,
  ...over,
});

describe('cueWords', () => {
  it('returns the real timings when the cue has them', () => {
    const words: Word[] = [{ w: 'hi', t: 1, d: 0.5 }];
    expect(cueWords(cue({ words }))).toBe(words);
  });

  it('spreads synthetic words across the whole cue span', () => {
    const out = cueWords(cue({ start: 2, end: 6 }));
    expect(out).toHaveLength(3);
    expect(out[0]?.t).toBeCloseTo(2);
    const last = out[2] as Word;
    expect(last.t + last.d).toBeCloseTo(6);
  });

  it('weights longer words with more time', () => {
    const out = cueWords(cue({ text: 'a lengthy' }));
    expect((out[1] as Word).d).toBeGreaterThan((out[0] as Word).d);
  });

  it('returns nothing for an empty cue', () => {
    expect(cueWords(cue({ text: '   ' }))).toEqual([]);
  });
});

describe('retextCue', () => {
  const words: Word[] = [
    { w: 'one', t: 0, d: 1 },
    { w: 'two', t: 1, d: 1 },
  ];

  it('keeps the timings and relabels when the word count matches', () => {
    const out = retextCue(cue({ text: 'one two', words }), 'ONE TWO');
    expect(out.words).toHaveLength(2);
    expect(out.words?.[0]).toEqual({ w: 'ONE', t: 0, d: 1 });
  });

  it('drops the timings when the word count changes', () => {
    expect(retextCue(cue({ text: 'one two', words }), 'one two three').words).toBeNull();
  });

  it('leaves a cue that never had timings alone', () => {
    const out = retextCue(cue(), 'changed');
    expect(out.text).toBe('changed');
    expect(out.words).toBeNull();
  });

  it('does not mutate the cue it was given', () => {
    const original = cue({ text: 'one two', words });
    retextCue(original, 'different text entirely');
    expect(original.text).toBe('one two');
    expect(original.words).toBe(words);
  });
});

describe('shiftWords', () => {
  it('scales timings proportionally when a cue is stretched', () => {
    const words: Word[] = [
      { w: 'a', t: 0, d: 1 },
      { w: 'b', t: 1, d: 1 },
    ];
    const out = shiftWords({ ...cue({ words }), start: 0, end: 4 }, { start: 0, end: 2 });
    expect(out.words?.[0]).toEqual({ w: 'a', t: 0, d: 2 });
    expect(out.words?.[1]).toEqual({ w: 'b', t: 2, d: 2 });
  });

  it('translates timings when a cue is moved but not resized', () => {
    const words: Word[] = [{ w: 'a', t: 1, d: 1 }];
    const out = shiftWords({ ...cue({ words }), start: 5, end: 7 }, { start: 1, end: 3 });
    expect(out.words?.[0]?.t).toBeCloseTo(5);
  });

  it('gives up rather than dividing by a zero-length span', () => {
    const words: Word[] = [{ w: 'a', t: 1, d: 1 }];
    expect(shiftWords({ ...cue({ words }), start: 0, end: 2 }, { start: 1, end: 1 }).words).toBeNull();
  });
});

describe('wordsToCues', () => {
  const at = (w: string, t: number, d = 0.3): Word => ({ w, t, d });

  it('breaks a line once it reaches the word limit', () => {
    const out = wordsToCues([at('a', 0), at('b', 0.3), at('c', 0.6), at('d', 0.9)], 2);
    expect(out).toHaveLength(2);
    expect(out[0]?.text).toBe('a b');
  });

  it('breaks on a long silence', () => {
    const out = wordsToCues([at('a', 0), at('b', 5)], 10);
    expect(out).toHaveLength(2);
  });

  it('breaks after sentence-ending punctuation', () => {
    const out = wordsToCues([at('Hello', 0), at('there.', 0.3), at('Next', 0.6)], 10);
    expect(out[0]?.text).toBe('Hello there.');
  });

  it('spans each cue from its first word to the end of its last', () => {
    const out = wordsToCues([at('a', 1), at('b', 1.3)], 2);
    expect(out[0]?.start).toBeCloseTo(1);
    expect(out[0]?.end).toBeCloseTo(1.6);
  });

  it('returns nothing for no words', () => {
    expect(wordsToCues([], 5)).toEqual([]);
  });
});

describe('splitCueAt', () => {
  it('refuses a split too close to either edge', () => {
    expect(splitCueAt(cue(), 0.01)).toBeNull();
    expect(splitCueAt(cue(), 3.99)).toBeNull();
  });

  it('apportions plain text by position in the span', () => {
    const parts = splitCueAt(cue({ text: 'one two three four', start: 0, end: 4 }), 2);
    expect(parts?.[0].text).toBe('one two');
    expect(parts?.[1].text).toBe('three four');
  });

  it('splits on the real word timings when they exist', () => {
    const words: Word[] = [
      { w: 'one', t: 0, d: 1 },
      { w: 'two', t: 2.5, d: 1 },
    ];
    const parts = splitCueAt(cue({ text: 'one two', words }), 2);
    expect(parts?.[0].words).toHaveLength(1);
    expect(parts?.[1].words).toHaveLength(1);
    expect(parts?.[1].text).toBe('two');
  });

  it('gives the halves adjacent, non-overlapping spans', () => {
    const parts = splitCueAt(cue({ start: 1, end: 5 }), 3);
    expect(parts?.[0].end).toBe(3);
    expect(parts?.[1].start).toBe(3);
    expect(parts?.[1].end).toBe(5);
  });

  it('gives the new half its own id', () => {
    const parts = splitCueAt(cue(), 2);
    expect(parts?.[1].id).not.toBe(parts?.[0].id);
  });
});

describe('mergeCues', () => {
  const a = cue({ id: 'a', start: 0, end: 1, text: 'first' });
  const b = cue({ id: 'b', start: 1, end: 2, text: 'second' });

  it('spans both and joins the text', () => {
    const out = mergeCues(a, b);
    expect(out.start).toBe(0);
    expect(out.end).toBe(2);
    expect(out.text).toBe('first second');
  });

  it('concatenates word timings when both sides have them', () => {
    const out = mergeCues(
      { ...a, words: [{ w: 'first', t: 0, d: 1 }] },
      { ...b, words: [{ w: 'second', t: 1, d: 1 }] },
    );
    expect(out.words).toHaveLength(2);
  });

  it('drops word timings when only one side has them', () => {
    expect(mergeCues({ ...a, words: [{ w: 'first', t: 0, d: 1 }] }, b).words).toBeNull();
  });
});
