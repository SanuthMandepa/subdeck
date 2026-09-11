/**
 * The single <video> element every other module reads from.
 *
 * It deliberately lives outside React: the preview canvas, the timeline, the
 * transport and both export engines all need the same element, and none of
 * them wants a re-render when `currentTime` advances 60 times a second.
 */
import { clamp } from '../lib/util';

export const video = document.createElement('video');
video.preload = 'auto';
video.playsInline = true;

/* ---------------------------------------------------------------
   Playback graph.
   Routing the element through WebAudio lets the real-time burn-in
   recorder tap the audio independently of the monitor volume — a
   muted preview still exports with sound.
   --------------------------------------------------------------- */
let actx: AudioContext | null = null;
let monitorGain: GainNode | null = null;
let streamDest: MediaStreamAudioDestinationNode | null = null;
let graphFailed = false;

export function buildAudioGraph(initialVolume = 1): void {
  if (actx || graphFailed) return;
  try {
    const Ctx = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) throw new Error('no AudioContext');
    actx = new Ctx();
    const srcNode = actx.createMediaElementSource(video);
    monitorGain = actx.createGain();
    streamDest = actx.createMediaStreamDestination();
    srcNode.connect(monitorGain).connect(actx.destination);
    srcNode.connect(streamDest);
    monitorGain.gain.value = initialVolume;
  } catch (e) {
    // Without the graph we fall back to plain element volume; the real-time
    // exporter then tries video.captureStream() for its audio instead.
    console.warn('audio graph unavailable', e);
    graphFailed = true;
    actx = null;
    monitorGain = null;
    streamDest = null;
  }
}

export const exportAudioTracks = (): MediaStreamTrack[] =>
  streamDest ? streamDest.stream.getAudioTracks() : [];

export function setVolume(v: number): void {
  if (monitorGain) monitorGain.gain.value = v;
  else video.volume = v;
}

export async function resumeAudio(): Promise<void> {
  if (actx && actx.state === 'suspended') {
    try {
      await actx.resume();
    } catch {
      /* the browser will let it through on the next gesture */
    }
  }
}

/**
 * Seek and wait for it to land.
 *
 * Resolves immediately when we are already there — otherwise `seeked` never
 * fires and every caller downstream hangs forever. The timeout is the same
 * guard for files that refuse to seek at all.
 */
export function seekTo(t: number, dur: number): Promise<void> {
  return new Promise((res) => {
    const target = clamp(t, 0, Math.max(0, dur - 0.001));
    if (Math.abs(video.currentTime - target) < 0.02) return res();

    let done = false;
    const fin = () => {
      if (done) return;
      done = true;
      video.removeEventListener('seeked', fin);
      res();
    };
    video.addEventListener('seeked', fin);
    try {
      video.currentTime = target;
    } catch {
      fin();
    }
    setTimeout(fin, 4000);
  });
}

/** Load a file and wait for metadata. Resolves false if it cannot be decoded. */
export function openSource(url: string): Promise<boolean> {
  return new Promise((res) => {
    const cleanup = () => {
      video.removeEventListener('loadedmetadata', good);
      video.removeEventListener('error', bad);
    };
    const good = () => {
      cleanup();
      res(true);
    };
    const bad = () => {
      cleanup();
      res(false);
    };
    video.addEventListener('loadedmetadata', good);
    video.addEventListener('error', bad);
    video.src = url;
    video.load();
    setTimeout(bad, 30_000);
  });
}
