/**
 * REAL-TIME ENGINE (MediaRecorder)
 *
 * The fallback for browsers without WebCodecs. It samples a live canvas, so
 * any hitch while drawing drops frames and the audio — which keeps running —
 * ends up ahead of the picture. Correct only when the machine keeps up, which
 * is why Precise is the default wherever it exists.
 */
import { download, megabytes } from '../../lib/util';
import { snap } from '../../state/store';
import { drawFrame } from '../caption';
import { buildAudioGraph, exportAudioTracks, resumeAudio, seekTo, video } from '../media';
import { pickMime } from './caps';
import type { BurnContext } from './precise';

/** How often the watchdog checks that playback is still advancing. */
const GUARD_MS = 250;
/** Ticks with no progress before we give up (~10 s). */
const STALL_LIMIT = 40;
const UI_THROTTLE_MS = 200;

/** Signature the burn dispatcher uses to stop a run early. */
export type StopFn = () => void;

export async function burnRealtime(
  job: BurnContext,
  registerStop: (fn: StopFn) => void,
): Promise<void> {
  const { ctx, canvas, W, H, bitrate, baseName } = job;
  const s = snap();

  const mime = pickMime();
  if (!mime) throw new Error('this browser can neither encode nor record video');

  buildAudioGraph();
  await resumeAudio();

  video.pause();
  video.playbackRate = 1;
  await seekTo(0, s.dur);
  // Never capture a blank first frame.
  drawFrame(ctx, W, H, 0, { source: video, cues: s.cues, style: s.style });

  const stream = canvas.captureStream(30);
  if (!stream.getVideoTracks().length) throw new Error('the canvas produced no video track');

  let audioTracks = exportAudioTracks();
  if (!audioTracks.length) {
    const capture = (video as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream;
    if (capture) {
      try {
        audioTracks = capture.call(video).getAudioTracks();
      } catch {
        /* no audio then — the status line says so */
      }
    }
  }
  audioTracks.forEach((t) => stream.addTrack(t));

  const chunks: Blob[] = [];
  let raf = 0;
  let guard: ReturnType<typeof setInterval> | undefined;
  let stopped = false;
  let lastUI = 0;

  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate });
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size) chunks.push(e.data);
  };

  const finished = new Promise<void>((res, rej) => {
    recorder.onstop = () => res();
    recorder.onerror = (ev) =>
      rej(new Error(`recorder error: ${(ev as unknown as { error?: Error }).error?.name ?? 'unknown'}`));
  });

  s.setStatus({
    msg: 'recording · real time',
    pct: 0,
    sub: `${W}×${H} · ${audioTracks.length ? 'with audio' : 'NO audio track'} · keep this tab visible`,
    cancellable: true,
    recording: true,
  });

  const paint = () => {
    if (stopped) return;
    const live = snap();
    drawFrame(ctx, W, H, video.currentTime, { source: video, cues: live.cues, style: live.style });
    const now = performance.now();
    if (now - lastUI > UI_THROTTLE_MS) {
      // Don't touch the store every frame — it would re-render the panel 60×/s.
      lastUI = now;
      s.setStatus({
        pct: isFinite(live.dur) && live.dur ? (video.currentTime / live.dur) * 100 : null,
        cancellable: true,
        recording: true,
      });
    }
  };

  const pump = () => {
    if (stopped) return;
    paint();
    raf = requestAnimationFrame(pump);
  };

  const stop: StopFn = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    clearInterval(guard);
    try {
      video.pause();
    } catch {
      /* already paused */
    }
    try {
      if (recorder.state !== 'inactive') recorder.stop();
    } catch {
      /* already stopped */
    }
  };
  registerStop(stop);
  video.addEventListener('ended', stop, { once: true });

  // rAF is throttled in a background tab and some files never fire `ended`,
  // so this keeps frames moving and guarantees the run terminates.
  let stall = 0;
  let lastT = -1;
  guard = setInterval(() => {
    if (stopped) return;
    paint();
    const live = snap();
    if (live.cancelExport) return stop();
    if (video.paused) void video.play().catch(() => {});
    if (isFinite(live.dur) && live.dur && video.currentTime >= live.dur - 0.06) return stop();
    stall = Math.abs(video.currentTime - lastT) < 0.001 ? stall + 1 : 0;
    lastT = video.currentTime;
    if (stall > STALL_LIMIT) stop();
  }, GUARD_MS);

  recorder.start(1000);
  await video.play();
  pump();
  await finished;

  video.removeEventListener('ended', stop);
  stopped = true;
  cancelAnimationFrame(raf);
  clearInterval(guard);

  if (!chunks.length) throw new Error('the recorder produced no data');
  const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
  const blob = new Blob(chunks, { type: mime.split(';')[0] });
  const name = `${baseName}-subtitled.${ext}`;
  download(name, blob);
  s.notify(`Saved ${name} · ${megabytes(blob.size)}`);
}
