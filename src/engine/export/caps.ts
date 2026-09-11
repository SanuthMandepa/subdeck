/** What this browser can actually do, probed once and cheaply. */

export const hasWebCodecs = (): boolean =>
  typeof VideoEncoder !== 'undefined' &&
  typeof VideoFrame !== 'undefined' &&
  typeof AudioEncoder !== 'undefined' &&
  typeof AudioData !== 'undefined';

/** Best container/codec pair the MediaRecorder fallback can write. */
export function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  return (
    [
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4;codecs=avc1,mp4a',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ].find((t) => {
      try {
        return MediaRecorder.isTypeSupported(t);
      } catch {
        return false;
      }
    }) ?? ''
  );
}

/**
 * Walk down the H.264 profiles until one is actually supported at this size.
 * High profile first: it gives the best quality per bit, but plenty of
 * machines only have the baseline hardware encoder.
 */
export async function pickAvc(
  W: number,
  H: number,
  fps: number,
  bitrate: number,
): Promise<VideoEncoderConfig | null> {
  for (const codec of ['avc1.640034', 'avc1.640028', 'avc1.4d4028', 'avc1.42e01f', 'avc1.42001f']) {
    const cfg: VideoEncoderConfig = {
      codec,
      width: W,
      height: H,
      bitrate,
      framerate: fps,
      avc: { format: 'avc' },
    };
    try {
      const s = await VideoEncoder.isConfigSupported(cfg);
      if (s.supported) return (s.config as VideoEncoderConfig | undefined) ?? cfg;
    } catch {
      /* try the next profile down */
    }
  }
  return null;
}

/** Encoders want even dimensions; odd ones fail late and unhelpfully. */
export function exportDims(vw: number, vh: number, scalePct: number): { W: number; H: number } {
  return {
    W: Math.max(2, Math.round((vw * scalePct) / 100 / 2) * 2),
    H: Math.max(2, Math.round((vh * scalePct) / 100 / 2) * 2),
  };
}
