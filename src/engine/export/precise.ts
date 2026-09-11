/**
 * PRECISE ENGINE (WebCodecs)
 *
 * Steps the video frame by frame, stamps every frame with an exact
 * presentation time, and encodes the audio independently from the decoded
 * PCM. Because neither track depends on wall-clock timing the result cannot
 * drift — and it is not bound to real time, so a slow machine produces a
 * correct file rather than a stuttering, out-of-sync one.
 */
import { tc } from '../../lib/timecode';
import { download, idle, megabytes } from '../../lib/util';
import { snap } from '../../state/store';
import { decodeForExport } from '../audio';
import { drawFrame } from '../caption';
import { seekTo, video } from '../media';
import { pickAvc } from './caps';

/** How many encodes may be in flight before we let the main thread breathe. */
const VIDEO_QUEUE_MAX = 8;
const AUDIO_QUEUE_MAX = 24;
/** Samples per AudioData chunk. */
const AUDIO_STEP = 1024 * 20;
/** Keyframe every N seconds. */
const GOP_SECONDS = 3;

export interface BurnContext {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  W: number;
  H: number;
  bitrate: number;
  fps: number;
  baseName: string;
}

export async function burnPrecise(job: BurnContext): Promise<void> {
  const { ctx, canvas, W, H, bitrate, fps, baseName } = job;
  const s = snap();

  const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');

  const vcfg = await pickAvc(W, H, fps, bitrate);
  if (!vcfg) throw new Error(`no supported H.264 encoder configuration at ${W}×${H}`);

  s.setStatus({ msg: 'decoding audio', pct: null, sub: 'reading the original audio track…', cancellable: true, recording: true });
  const ab = s.file ? await decodeForExport(s.file) : null;

  let acfg: AudioEncoderConfig | null = null;
  let nCh = 0;
  if (ab) {
    nCh = Math.min(2, ab.numberOfChannels);
    const probe: AudioEncoderConfig = {
      codec: 'mp4a.40.2',
      sampleRate: ab.sampleRate,
      numberOfChannels: nCh,
      bitrate: 160_000,
    };
    try {
      if ((await AudioEncoder.isConfigSupported(probe)).supported) acfg = probe;
    } catch {
      /* no AAC encoder — the file just goes out silent */
    }
  }

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width: W, height: H, frameRate: fps },
    ...(acfg && ab ? { audio: { codec: 'aac' as const, numberOfChannels: nCh, sampleRate: ab.sampleRate } } : {}),
    fastStart: 'in-memory' as const,
  });

  let encErr: Error | null = null;
  const venc = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      encErr = e;
    },
  });
  venc.configure(vcfg);

  /* Audio first — it is quick, and the muxer interleaves for us. */
  if (acfg && ab) {
    s.setStatus({
      msg: 'encoding audio',
      pct: null,
      sub: `${nCh} ch · ${ab.sampleRate} Hz · aac`,
      cancellable: true,
      recording: true,
    });

    const aenc = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => {
        encErr = e;
      },
    });
    aenc.configure(acfg);

    const chans: Float32Array[] = [];
    for (let c = 0; c < nCh; c++) chans.push(ab.getChannelData(c));

    for (let o = 0; o < ab.length; o += AUDIO_STEP) {
      if (snap().cancelExport || encErr) break;
      const len = Math.min(AUDIO_STEP, ab.length - o);
      const planar = new Float32Array(len * nCh);
      for (let c = 0; c < nCh; c++) planar.set((chans[c] as Float32Array).subarray(o, o + len), c * len);

      const data = new AudioData({
        format: 'f32-planar',
        sampleRate: ab.sampleRate,
        numberOfChannels: nCh,
        numberOfFrames: len,
        timestamp: Math.round((o / ab.sampleRate) * 1e6),
        data: planar,
      });
      aenc.encode(data);
      data.close();
      if (aenc.encodeQueueSize > AUDIO_QUEUE_MAX) await idle();
    }
    await aenc.flush();
    aenc.close();
  }
  if (encErr) throw encErr;

  /* Now the picture, one exact frame at a time. */
  const dur = s.dur;
  const totalFrames = Math.max(1, Math.round(dur * fps));
  const gop = Math.max(1, Math.round(fps * GOP_SECONDS));
  const t0 = performance.now();
  let done = 0;

  video.pause();
  for (let i = 0; i < totalFrames; i++) {
    if (snap().cancelExport || encErr) break;

    const t = Math.min(Math.max(0, dur - 0.0005), i / fps);
    await seekTo(t, dur);

    const live = snap();
    drawFrame(ctx, W, H, t, { source: video, cues: live.cues, style: live.style });

    const frame = new VideoFrame(canvas, {
      timestamp: Math.round((i * 1e6) / fps),
      duration: Math.round(1e6 / fps),
    });
    venc.encode(frame, { keyFrame: i % gop === 0 });
    frame.close();
    done = i + 1;

    while (venc.encodeQueueSize > VIDEO_QUEUE_MAX && !encErr) await idle();

    if (i % 4 === 0) {
      const elapsed = (performance.now() - t0) / 1000;
      const rate = done / Math.max(0.001, elapsed);
      const left = (totalFrames - done) / Math.max(0.001, rate);
      s.setStatus({
        msg: 'encoding · precise',
        pct: (done / totalFrames) * 100,
        sub: `frame ${done} / ${totalFrames} · ${(rate / fps).toFixed(2)}× real time · ~${tc(left, '.', false)} left`,
        cancellable: true,
        recording: true,
      });
    }
  }

  if (encErr) throw encErr;
  // finalize() needs at least one chunk to have set the decoder config,
  // otherwise it dies on a null colorSpace rather than saying what is wrong.
  if (!done) {
    try {
      venc.close();
    } catch {
      /* already closed */
    }
    throw new Error(
      snap().cancelExport ? 'cancelled before any frame was encoded' : 'no frames were encoded',
    );
  }

  s.setStatus({ msg: 'finalising', pct: 100, sub: 'writing the MP4…', cancellable: false, recording: true });
  await venc.flush();
  venc.close();
  muxer.finalize();

  const blob = new Blob([target.buffer], { type: 'video/mp4' });
  const partial = snap().cancelExport && done < totalFrames;
  const name = `${baseName}-subtitled${partial ? '-partial' : ''}.mp4`;
  download(name, blob);
  s.notify(
    `${partial ? 'Stopped early — saved' : 'Saved'} ${name} · ${megabytes(blob.size)}${acfg ? '' : ' · NO audio'}`,
  );
}
