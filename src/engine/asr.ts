/**
 * AUTO-TRANSCRIBE — Whisper via transformers.js, on this machine.
 *
 * The `_timestamped` exports are the ones built with `output_attentions=True`.
 * Word-level timing is derived from the decoder's cross-attention via DTW, so
 * the plain exports fail with "Model outputs must contain cross attentions".
 * Same weights, same accuracy — just extra graph outputs — so we always use
 * these and the word-timing toggle never forces a second model download.
 */
import type { Cue, Word } from '../lib/types';
import { clamp, uid } from '../lib/util';
import { wordsToCues } from '../lib/words';
import { snap } from '../state/store';

export const MODELS: ReadonlyArray<readonly [string, string]> = [
  ['onnx-community/whisper-tiny_timestamped', 'Tiny · ~40 MB · fastest'],
  ['onnx-community/whisper-base_timestamped', 'Base · ~80 MB · balanced'],
  ['onnx-community/whisper-small_timestamped', 'Small · ~250 MB · most accurate'],
];

export const LANGS: ReadonlyArray<readonly [string, string]> = [
  ['auto', 'Detect automatically'], ['english', 'English'], ['spanish', 'Spanish'],
  ['french', 'French'], ['german', 'German'], ['italian', 'Italian'],
  ['portuguese', 'Portuguese'], ['dutch', 'Dutch'], ['russian', 'Russian'],
  ['polish', 'Polish'], ['turkish', 'Turkish'], ['arabic', 'Arabic'],
  ['hindi', 'Hindi'], ['sinhala', 'Sinhala'], ['tamil', 'Tamil'],
  ['japanese', 'Japanese'], ['korean', 'Korean'], ['chinese', 'Chinese'],
  ['indonesian', 'Indonesian'], ['vietnamese', 'Vietnamese'], ['ukrainian', 'Ukrainian'],
  ['swedish', 'Swedish'], ['czech', 'Czech'], ['greek', 'Greek'],
  ['hebrew', 'Hebrew'], ['thai', 'Thai'], ['romanian', 'Romanian'],
  ['hungarian', 'Hungarian'], ['danish', 'Danish'], ['finnish', 'Finnish'],
  ['norwegian', 'Norwegian'], ['malay', 'Malay'], ['bengali', 'Bengali'],
  ['urdu', 'Urdu'],
];

const SAMPLE_RATE = 16000;

/* transformers.js has no published types for the pipeline shape we use. */
type Chunk = { text?: string; timestamp?: [number | null, number | null] };
type AsrResult = { chunks?: Chunk[] };
type Pipeline = ((audio: Float32Array, opts: Record<string, unknown>) => Promise<AsrResult>) & {
  tokenizer: unknown;
  dispose?: () => void;
};

/** Kept across runs so switching tabs does not re-download the weights. */
let transcriber: Pipeline | null = null;
let loadedKey = '';

async function chooseDevice(preferGpu: boolean): Promise<'webgpu' | 'wasm'> {
  if (!preferGpu || !navigator.gpu) return 'wasm';
  try {
    return (await navigator.gpu.requestAdapter()) ? 'webgpu' : 'wasm';
  } catch {
    return 'wasm';
  }
}

export async function autoTranscribe(): Promise<void> {
  const s = snap();
  if (s.transcribing) return;
  if (!s.ready) return s.notify('Load a video first', true);
  if (!s.pcm) {
    return s.notify('Audio is still decoding — or this file has no readable audio track', true);
  }
  if (s.cues.length) {
    const go = await s.ask({
      title: 'Replace existing cues?',
      body: `A fresh transcript will replace the ${s.cues.length} cues you already have. This can be undone with Ctrl+Z.`,
      confirmLabel: 'Transcribe',
      danger: true,
    });
    if (!go) return;
  }

  const prefs = snap().asr;
  const audio = s.pcm;

  s.setTranscribing(true);
  s.setStatus({
    msg: 'loading model',
    pct: 0,
    sub: 'first run downloads the model, then it is cached',
    cancellable: true,
    recording: false,
  });

  try {
    const TJS = await import('@huggingface/transformers');
    TJS.env.allowLocalModels = false;

    const device = await chooseDevice(prefs.gpu);
    const key = `${prefs.model}|${device}`;

    if (!transcriber || loadedKey !== key) {
      try {
        transcriber?.dispose?.();
      } catch {
        /* nothing to dispose */
      }
      transcriber = null;

      const files: Record<string, number> = {};
      transcriber = (await TJS.pipeline('automatic-speech-recognition', prefs.model, {
        device,
        dtype:
          device === 'webgpu'
            ? { encoder_model: 'fp32', decoder_model_merged: 'q4' }
            : { encoder_model: 'fp32', decoder_model_merged: 'q8' },
        progress_callback: (p: { status?: string; file?: string; loaded?: number; total?: number }) => {
          if (p.status === 'progress' && p.total) {
            files[p.file ?? ''] = (p.loaded ?? 0) / p.total;
            const vals = Object.values(files);
            snap().setStatus({
              msg: 'downloading model',
              pct: (vals.reduce((a, b) => a + b, 0) / vals.length) * 100,
              sub: (p.file ?? '').split('/').pop() ?? '',
              cancellable: true,
            });
          } else if (p.status === 'ready') {
            snap().setStatus({ msg: 'model ready', pct: 100, sub: '', cancellable: true });
          }
        },
      })) as unknown as Pipeline;
      loadedKey = key;
    }
    if (snap().cancelASR) throw new Error('cancelled');

    snap().setStatus({
      msg: device === 'webgpu' ? 'transcribing · gpu' : 'transcribing · cpu',
      pct: 0,
      sub: 'running entirely on your machine',
      cancellable: true,
    });

    const total = audio.length / SAMPLE_RATE;
    let chunkStart = 0;
    let buf = '';
    const streamer = TJS.WhisperTextStreamer
      ? new TJS.WhisperTextStreamer(transcriber.tokenizer as never, {
          skip_prompt: true,
          callback_function: (t: string) => {
            buf = (buf + t).slice(-180);
          },
          on_chunk_start: (t: number) => {
            chunkStart = t;
          },
          on_chunk_end: (t: number) =>
            snap().setStatus({
              pct: clamp(((chunkStart + t) / total) * 100, 0, 99),
              sub: buf.trim(),
              cancellable: true,
            }),
        })
      : null;

    const opts = {
      chunk_length_s: 30,
      stride_length_s: 5,
      task: prefs.translate ? 'translate' : 'transcribe',
      ...(prefs.lang !== 'auto' ? { language: prefs.lang } : {}),
      streamer,
    };

    let wordMode = prefs.words;
    let res: AsrResult;
    try {
      res = await transcriber(audio, { ...opts, return_timestamps: wordMode ? 'word' : true });
    } catch (err) {
      // A model without cross-attention outputs cannot do word alignment.
      // Rather than dropping the whole transcript, fall back to line timing.
      const msg = err instanceof Error ? err.message : '';
      if (wordMode && /cross.?attention|output_attentions/i.test(msg)) {
        console.warn('word timing unavailable, falling back', err);
        snap().notify('This model has no word-level timing — using line timing instead', true);
        snap().setStatus({ msg: 'retrying · line timing', pct: 0, sub: '', cancellable: true });
        wordMode = false;
        res = await transcriber(audio, { ...opts, return_timestamps: true });
      } else throw err;
    }
    if (snap().cancelASR) throw new Error('cancelled');

    const raw = (res.chunks ?? []).filter((c) => (c.text ?? '').trim());
    if (!raw.length) throw new Error('Whisper found no speech in this audio');

    const cues = wordMode ? cuesFromWords(raw) : cuesFromLines(raw, total);

    snap().setCues(cues, { select: -1 });
    snap().clearStatus();
    snap().notify(
      `Transcribed ${cues.length} cues${wordMode ? ' with word timing' : ''} — review before exporting`,
    );
  } catch (err) {
    console.error(err);
    snap().clearStatus();
    const msg = err instanceof Error ? err.message : String(err);
    const cancelled = /cancel/i.test(msg);
    snap().notify(cancelled ? 'Transcription cancelled' : `Transcription failed: ${msg}`, !cancelled);
  } finally {
    snap().setTranscribing(false);
  }
}

/** Whisper emits one chunk per word in word mode; regroup them into lines. */
function cuesFromWords(raw: Chunk[]): Cue[] {
  const words: Word[] = raw
    .map((c, i): Word => {
      let [s, e] = c.timestamp ?? [null, null];
      if (s == null) s = i ? (raw[i - 1]?.timestamp?.[1] ?? 0) : 0;
      if (e == null || e <= s) e = s + 0.28;
      return { w: (c.text ?? '').trim(), t: s, d: e - s };
    })
    .filter((o) => o.w);
  return wordsToCues(words, snap().asr.perLine);
}

function cuesFromLines(raw: Chunk[], total: number): Cue[] {
  return raw.map((c, i): Cue => {
    let [s, e] = c.timestamp ?? [null, null];
    if (s == null) s = i ? (raw[i - 1]?.timestamp?.[1] ?? 0) : 0;
    if (e == null) e = raw[i + 1]?.timestamp?.[0] ?? Math.min(total, s + 3);
    if (e <= s) e = s + 0.6;
    return { id: uid(), start: s, end: e, text: (c.text ?? '').trim(), words: null };
  });
}
