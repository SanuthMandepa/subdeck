/** Opening a file: validation, cue restoration, metadata, audio decode. */
import { loadProject } from '../lib/storage';
import { parseSubs } from '../lib/subtitles';
import { snap } from '../state/store';
import { decodeForAnalysis } from './audio';
import { buildAudioGraph, openSource, seekTo, video } from './media';

const MEDIA_EXT = /\.(mp4|mkv|webm|mov|m4v|avi|mp3|wav|m4a|ogg|flac)$/i;
export const SUBTITLE_EXT = /\.(srt|vtt)$/i;

export const isMedia = (f: File): boolean => /^(video|audio)\//.test(f.type) || MEDIA_EXT.test(f.name);

export async function loadSource(file: File): Promise<void> {
  const s = snap();
  if (s.recording) return s.notify('Finish or stop the export first', true);
  if (!isMedia(file)) return s.notify('That does not look like a video or audio file', true);

  /* Decide what happens to the cues currently on screen before we swap. */
  const saved = loadProject(file.name);
  let carried = s.cues;
  if (saved && saved.length) {
    carried = saved;
  } else if (s.cues.length && s.file && s.file.name !== file.name) {
    const keep = await s.ask({
      title: 'Reuse these cues?',
      body: `You have ${s.cues.length} cues loaded and there is nothing saved for "${file.name}". Carry them over, or start this video with an empty list?`,
      confirmLabel: 'Carry them over',
    });
    if (!keep) carried = [];
  }

  try {
    video.pause();
  } catch {
    /* nothing playing */
  }
  if (s.url) URL.revokeObjectURL(s.url);

  const url = URL.createObjectURL(file);
  s.beginLoad(file, url);
  s.setCues(carried, { select: -1, history: false });

  if (!(await openSource(url))) {
    snap().sourceFailed();
    return snap().notify(
      'This browser cannot decode that file — try MP4/WebM, or convert it first',
      true,
    );
  }

  const dur = isFinite(video.duration) ? video.duration : 0;
  snap().sourceReady({
    dur,
    vw: video.videoWidth || 1280,
    vh: video.videoHeight || 720,
  });

  await seekTo(0, dur);
  snap().setZoom(snap().zoom, 0);
  buildAudioGraph();

  snap().notify(
    saved && saved.length
      ? `Loaded — restored ${saved.length} saved cues for this file`
      : 'Loaded — decoding audio for the waveform…',
  );

  void analyse(file);
}

/** Decode in the background; a different file loading meanwhile wins. */
async function analyse(file: File): Promise<void> {
  try {
    const { pcm, peaks } = await decodeForAnalysis(file);
    if (snap().file !== file) return;
    snap().setAudio(pcm, peaks);
    snap().notify('Audio ready — auto-transcribe is available');
  } catch (err) {
    if (snap().file !== file) return;
    console.warn('audio decode', err);
    snap().notify("Could not decode this file's audio — manual captioning still works", true);
  }
}

export async function importSubtitles(f: File): Promise<void> {
  const s = snap();
  const cues = parseSubs(await f.text());
  if (!cues.length) return s.notify('No cues found in that file', true);
  s.setCues(cues, { select: -1 });
  s.notify(`Imported ${cues.length} cues from ${f.name}`);
}

/** Route a dropped or picked file to the right handler. */
export function acceptFile(f: File): void {
  if (SUBTITLE_EXT.test(f.name)) void importSubtitles(f);
  else void loadSource(f);
}
