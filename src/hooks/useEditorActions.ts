import { useMemo } from 'react';
import { paintPreview } from '../engine/loop';
import { resumeAudio, setVolume, video } from '../engine/media';
import { toSRT } from '../lib/subtitles';
import type { Cue } from '../lib/types';
import { clamp, download } from '../lib/util';
import { baseName } from '../engine/export/burn';
import { snap, useStore } from '../state/store';

/**
 * Editor verbs shared by the transport, the keyboard map and the cue rows.
 *
 * They read state through `snap()` rather than closing over it, so the
 * returned object is stable and never goes stale between renders.
 */
export function useEditorActions() {
  const notify = useStore((s) => s.notify);

  return useMemo(() => {
    const seek = (t: number) => {
      const s = snap();
      if (!s.ready) return;
      video.currentTime = clamp(t, 0, s.dur);
      paintPreview();
    };

    const selectedCue = (): Cue | null => {
      const s = snap();
      return s.sel >= 0 ? (s.cues[s.sel] ?? null) : null;
    };

    return {
      seek,
      selectedCue,

      togglePlay: () => {
        const s = snap();
        if (!s.ready) return notify('Load a video first', true);
        void resumeAudio();
        if (video.paused) void video.play().catch(() => {});
        else video.pause();
      },

      nudge: (by: number) => seek(video.currentTime + by),

      setVol: (v: number) => setVolume(v),
      setRate: (r: number) => {
        if (!snap().recording) video.playbackRate = r;
      },

      newCue: () => {
        const s = snap();
        if (!s.ready) return notify('Load a video first', true);
        const t = video.currentTime;
        s.addCue(t, Math.min(s.dur || t + 2, t + 2.4));
      },

      setIn: () => {
        const c = selectedCue();
        if (!c) return notify('Select a cue first', true);
        snap().retime(c.id, { start: video.currentTime });
      },

      setOut: () => {
        const c = selectedCue();
        if (!c) return notify('Select a cue first', true);
        snap().retime(c.id, { end: Math.max(video.currentTime, c.start + 0.2) });
      },

      splitSelected: () => {
        const c = selectedCue();
        if (!c) return notify('Select a cue first', true);
        if (!snap().splitAt(c.id, video.currentTime)) {
          notify('Move the playhead inside the cue first', true);
        }
      },

      deleteSelected: () => {
        const c = selectedCue();
        if (c) snap().removeCue(c.id);
      },

      playCue: (c: Cue) => {
        seek(c.start + 0.01);
        void resumeAudio();
        void video.play().catch(() => {});
      },

      downloadSrt: () => {
        const s = snap();
        if (!s.cues.length) return notify('There are no cues to export yet', true);
        download(`${baseName(s.file?.name)}.srt`, toSRT(s.cues), 'text/plain;charset=utf-8');
      },
    };
  }, [notify]);
}
