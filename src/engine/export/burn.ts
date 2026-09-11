import { snap } from '../../state/store';
import { video } from '../media';
import { exportDims, hasWebCodecs } from './caps';
import { burnPrecise, type BurnContext } from './precise';
import { burnRealtime, type StopFn } from './realtime';

/** Set while the real-time recorder is running, so Stop can reach into it. */
let activeStop: StopFn | null = null;

export const baseName = (fileName: string | null | undefined): string =>
  (fileName || 'subtitles').replace(/\.[^.]+$/, '');

export async function burnIn(): Promise<void> {
  const s = snap();
  if (!s.ready) return s.notify('Load a video first', true);
  if (s.recording || s.transcribing) return;
  if (!isFinite(s.dur) || s.dur <= 0) {
    return s.notify('This file reports no duration, so it cannot be re-encoded', true);
  }
  if (!s.cues.length) {
    const go = await s.ask({
      title: 'No cues',
      body: 'There is nothing to burn in. Export the video with no captions anyway?',
      confirmLabel: 'Export anyway',
    });
    if (!go) return;
  }

  const { engine, scale, bitrate, fps } = s.exportPrefs;
  const precise = engine === 'precise' && hasWebCodecs();
  const { W, H } = exportDims(s.vw, s.vh, scale);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return s.notify('Could not create the export canvas', true);

  const job: BurnContext = { ctx, canvas, W, H, bitrate, fps, baseName: baseName(s.file?.name) };
  // The real-time engine forces 1× playback; put the user's rate back after.
  const userRate = video.playbackRate;

  s.setRecording(true);
  s.setTab('cues');
  s.setStatus({ msg: 'preparing', pct: null, sub: '', cancellable: true, recording: true });

  try {
    if (precise) await burnPrecise(job);
    else await burnRealtime(job, (fn) => (activeStop = fn));
  } catch (err) {
    console.error('export', err);
    snap().notify(`Export failed: ${err instanceof Error ? err.message : String(err)}`, true);
  } finally {
    activeStop = null;
    const after = snap();
    after.setRecording(false);
    try {
      video.pause();
    } catch {
      /* already paused */
    }
    video.playbackRate = userRate;
    after.clearStatus();
  }
}

export function stopBurn(): void {
  const s = snap();
  if (!s.recording) return s.notify('Not exporting', true);
  s.requestCancel();
  activeStop?.();
  s.notify('Stopping…');
}
