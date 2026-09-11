/** Peaks for the waveform display; more than the timeline can ever show. */
const PEAK_BUCKETS = 4000;

export interface DecodedAudio {
  /** 16 kHz mono PCM — what Whisper wants. */
  pcm: Float32Array;
  /** Per-bucket maxima, normalised 0..1, for drawing the waveform. */
  peaks: Float32Array;
}

const audioContextCtor = (): typeof AudioContext | undefined =>
  window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

/**
 * Decode a file's audio to 16 kHz mono, plus a peak summary.
 *
 * Downmixing to mono here is deliberate: Whisper only ever sees one channel,
 * and it halves the memory a long file costs.
 */
export async function decodeForAnalysis(file: File): Promise<DecodedAudio> {
  const Ctx = audioContextCtor();
  if (!Ctx) throw new Error('no AudioContext in this browser');

  const buf = await file.arrayBuffer();
  const ctx = new Ctx({ sampleRate: 16000 });
  try {
    const ab = await ctx.decodeAudioData(buf);

    let pcm: Float32Array;
    if (ab.numberOfChannels > 1) {
      const a = ab.getChannelData(0);
      const b = ab.getChannelData(1);
      pcm = new Float32Array(a.length);
      for (let i = 0; i < a.length; i++) pcm[i] = ((a[i] as number) + (b[i] as number)) / 2;
    } else {
      pcm = ab.getChannelData(0).slice();
    }

    const step = Math.max(1, Math.floor(pcm.length / PEAK_BUCKETS));
    const peaks = new Float32Array(PEAK_BUCKETS);
    for (let i = 0; i < PEAK_BUCKETS; i++) {
      let mx = 0;
      const s0 = i * step;
      const s1 = Math.min(pcm.length, s0 + step);
      for (let j = s0; j < s1; j++) {
        const v = Math.abs(pcm[j] as number);
        if (v > mx) mx = v;
      }
      peaks[i] = mx;
    }

    return { pcm, peaks };
  } finally {
    void ctx.close();
  }
}

/**
 * Full-rate, full-channel decode for the export.
 *
 * The analysis PCM above is 16 kHz mono — fine for Whisper, unacceptable in a
 * delivered file — so burn-in decodes the original track a second time.
 */
export async function decodeForExport(file: File): Promise<AudioBuffer | null> {
  const Ctx = audioContextCtor();
  if (!Ctx) return null;
  const ctx = new Ctx();
  try {
    return await ctx.decodeAudioData(await file.arrayBuffer());
  } catch (err) {
    console.warn('export audio decode', err);
    return null;
  } finally {
    void ctx.close();
  }
}
