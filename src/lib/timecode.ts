/**
 * Format seconds as HH:MM:SS[sep]mmm.
 *
 * `sep` is '.' for WebVTT and ',' for SubRip, which is the only thing the two
 * formats disagree about here.
 */
export function tc(t: number, sep = '.', ms = true): string {
  t = Math.max(0, t || 0);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const p = (n: number) => String(n).padStart(2, '0');
  const base = `${p(h)}:${p(m)}:${p(s)}`;
  return ms ? `${base}${sep}${String(Math.floor((t % 1) * 1000)).padStart(3, '0')}` : base;
}

/**
 * Parse a timecode the user typed. Accepts HH:MM:SS,mmm / MM:SS.mmm / MM:SS,
 * and falls back to a bare number of seconds. Returns null if it is not any of
 * those, so the caller can reject the edit rather than store a NaN.
 */
export function parseTC(str: string | number | null | undefined): number | null {
  if (str == null) return null;
  const m = String(str)
    .trim()
    .match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/);
  if (m) {
    const [, h, mm, ss, frac] = m;
    return (
      Number(h ?? 0) * 3600 +
      Number(mm) * 60 +
      Number(ss) +
      Number((frac ?? '0').padEnd(3, '0')) / 1000
    );
  }
  const n = parseFloat(String(str));
  return isFinite(n) ? n : null;
}
