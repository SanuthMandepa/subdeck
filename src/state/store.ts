/**
 * The one shared store.
 *
 * Zustand rather than Context because the render loop, the timeline and both
 * export engines all read this state from *outside* React — `useStore.getState()`
 * inside a requestAnimationFrame callback is the whole reason for the choice.
 * Context could not do that without dragging every read through a component.
 *
 * Deliberately absent: the playhead. `video.currentTime` advances 60 times a
 * second and lives on the element itself; putting it here would re-render the
 * tree every frame. Components that display it write to a ref instead.
 */
import { create } from 'zustand';
import { loadStyle, persist } from '../lib/storage';
import { freshStyle } from '../lib/style';
import type {
  AsrPrefs,
  CaptionStyle,
  Cue,
  ExportPrefs,
  JobStatus,
  Word,
} from '../lib/types';
import { clamp, uid } from '../lib/util';
import { mergeCues, shiftWords, splitCueAt } from '../lib/words';
import { hasWebCodecs } from '../engine/export/caps';

export type Tab = 'cues' | 'style' | 'export';

export interface ToastMsg {
  id: number;
  msg: string;
  bad: boolean;
}

export interface ConfirmRequest {
  title: string;
  body: string;
  confirmLabel: string;
  danger: boolean;
}

interface Snapshot {
  cues: Cue[];
  sel: number;
}

const IDLE_STATUS: JobStatus = {
  active: false,
  msg: '',
  pct: null,
  sub: '',
  cancellable: false,
  recording: false,
};

const MAX_HISTORY = 60;

export interface AppState {
  /* source */
  file: File | null;
  url: string | null;
  dur: number;
  ready: boolean;
  vw: number;
  vh: number;
  loading: boolean;

  /* audio */
  pcm: Float32Array | null;
  peaks: Float32Array | null;

  /* document */
  cues: Cue[];
  sel: number;
  liveIndex: number;
  style: CaptionStyle;

  /* timeline view */
  zoom: number;
  view: number;

  /* chrome */
  tab: Tab;
  toast: ToastMsg | null;
  shortcutsOpen: boolean;
  aboutOpen: boolean;
  confirm: ConfirmRequest | null;

  /* jobs */
  status: JobStatus;
  transcribing: boolean;
  recording: boolean;
  cancelASR: boolean;
  cancelExport: boolean;

  /* prefs */
  asr: AsrPrefs;
  exportPrefs: ExportPrefs;

  /* history */
  past: Snapshot[];
  future: Snapshot[];
}

export interface AppActions {
  notify: (msg: string, bad?: boolean) => void;
  dismissToast: () => void;
  setTab: (tab: Tab) => void;
  setShortcuts: (open: boolean) => void;
  setAbout: (open: boolean) => void;
  ask: (req: Partial<ConfirmRequest> & { title: string; body: string }) => Promise<boolean>;
  resolveConfirm: (ok: boolean) => void;

  beginLoad: (file: File, url: string) => void;
  sourceReady: (info: { dur: number; vw: number; vh: number }) => void;
  sourceFailed: () => void;
  setAudio: (pcm: Float32Array, peaks: Float32Array) => void;

  setCues: (cues: Cue[], opts?: { select?: number; history?: boolean }) => void;
  select: (i: number) => void;
  setLive: (i: number) => void;
  addCue: (start: number, end: number) => string;
  updateCue: (id: string, patch: Partial<Cue>) => void;
  retime: (id: string, patch: { start?: number; end?: number }) => void;
  removeCue: (id: string) => void;
  splitAt: (id: string, t: number) => boolean;
  mergeNext: (id: string) => boolean;
  sortCues: () => void;
  clearCues: () => void;
  /** Live timeline drag: no history entry, no persist, until it ends. */
  dragCue: (index: number, next: { start: number; end: number; words: Word[] | null }) => void;

  undo: () => void;
  redo: () => void;
  commit: () => void;

  setStyle: (patch: Partial<CaptionStyle>) => void;
  resetStyle: () => void;

  setZoom: (zoom: number, now: number) => void;
  setView: (view: number) => void;

  setStatus: (patch: Partial<JobStatus>) => void;
  clearStatus: () => void;
  setTranscribing: (v: boolean) => void;
  setRecording: (v: boolean) => void;
  requestCancel: () => void;

  setAsr: (patch: Partial<AsrPrefs>) => void;
  setExportPrefs: (patch: Partial<ExportPrefs>) => void;

  save: () => void;
}

let confirmResolver: ((ok: boolean) => void) | null = null;
let toastSeq = 0;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

const snapshot = (s: AppState): Snapshot => ({ cues: s.cues, sel: s.sel });

/** Cues are always held sorted; several features assume neighbour order. */
const sorted = (cues: Cue[]): Cue[] => [...cues].sort((a, b) => a.start - b.start);

export const useStore = create<AppState & AppActions>((set, get) => ({
  file: null,
  url: null,
  dur: 0,
  ready: false,
  vw: 1280,
  vh: 720,
  loading: false,

  pcm: null,
  peaks: null,

  cues: [],
  sel: -1,
  liveIndex: -1,
  style: loadStyle(),

  zoom: 0,
  view: 0,

  tab: 'cues',
  toast: null,
  shortcutsOpen: false,
  aboutOpen: false,
  confirm: null,

  status: IDLE_STATUS,
  transcribing: false,
  recording: false,
  cancelASR: false,
  cancelExport: false,

  asr: {
    model: 'onnx-community/whisper-base_timestamped',
    lang: 'auto',
    translate: false,
    gpu: true,
    words: true,
    perLine: 5,
  },
  exportPrefs: {
    engine: hasWebCodecs() ? 'precise' : 'realtime',
    scale: 100,
    fps: 30,
    bitrate: 8_000_000,
  },

  past: [],
  future: [],

  /* ---------------- chrome ---------------- */
  notify: (msg, bad = false) => set({ toast: { id: ++toastSeq, msg, bad } }),
  dismissToast: () => set({ toast: null }),
  setTab: (tab) => set({ tab }),
  setShortcuts: (shortcutsOpen) => set({ shortcutsOpen }),
  setAbout: (aboutOpen) => set({ aboutOpen }),

  ask: (req) =>
    new Promise<boolean>((resolve) => {
      confirmResolver?.(false); // a second prompt supersedes the first
      confirmResolver = resolve;
      set({
        confirm: {
          confirmLabel: 'Confirm',
          danger: false,
          ...req,
        },
      });
    }),
  resolveConfirm: (ok) => {
    const r = confirmResolver;
    confirmResolver = null;
    set({ confirm: null });
    r?.(ok);
  },

  /* ---------------- source ---------------- */
  beginLoad: (file, url) =>
    set({
      file,
      url,
      loading: true,
      ready: false,
      pcm: null,
      peaks: null,
      sel: -1,
      liveIndex: -1,
      past: [],
      future: [],
    }),

  sourceReady: ({ dur, vw, vh }) => set({ dur, vw, vh, ready: true, loading: false }),
  sourceFailed: () => set({ loading: false, ready: false, file: null, url: null }),
  setAudio: (pcm, peaks) => set({ pcm, peaks }),

  /* ---------------- cues ---------------- */
  commit: () => set((s) => ({ past: [...s.past, snapshot(s)].slice(-MAX_HISTORY), future: [] })),

  setCues: (cues, opts = {}) => {
    const { select, history = true } = opts;
    if (history) get().commit();
    set((s) => ({ cues: sorted(cues), sel: select ?? s.sel }));
    get().save();
  },

  select: (sel) => set({ sel }),
  setLive: (liveIndex) => set({ liveIndex }),

  addCue: (start, end) => {
    const cue: Cue = { id: uid(), start, end, text: '', words: null };
    get().commit();
    const cues = sorted([...get().cues, cue]);
    set({ cues, sel: cues.indexOf(cue) });
    get().save();
    return cue.id;
  },

  updateCue: (id, patch) => {
    set((s) => ({ cues: s.cues.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
    get().save();
  },

  retime: (id, patch) => {
    const s = get();
    const prev = s.cues.find((c) => c.id === id);
    if (!prev) return;

    s.commit();
    let next: Cue = { ...prev, ...patch };
    next.start = clamp(next.start, 0, s.dur || next.start);
    if (next.end <= next.start) next.end = next.start + 0.4;
    next = shiftWords(next, prev);

    const cues = sorted(s.cues.map((c) => (c.id === id ? next : c)));
    set({ cues, sel: cues.findIndex((c) => c.id === id) });
    get().save();
  },

  removeCue: (id) => {
    get().commit();
    set((s) => ({ cues: s.cues.filter((c) => c.id !== id), sel: -1 }));
    get().save();
  },

  splitAt: (id, t) => {
    const s = get();
    const i = s.cues.findIndex((c) => c.id === id);
    if (i < 0) return false;
    const parts = splitCueAt(s.cues[i] as Cue, t);
    if (!parts) return false;

    s.commit();
    const cues = [...s.cues];
    cues.splice(i, 1, parts[0], parts[1]);
    set({ cues, sel: i + 1 });
    get().save();
    return true;
  },

  mergeNext: (id) => {
    const s = get();
    const i = s.cues.findIndex((c) => c.id === id);
    if (i < 0 || i + 1 >= s.cues.length) return false;

    s.commit();
    const cues = [...s.cues];
    cues.splice(i, 2, mergeCues(cues[i] as Cue, cues[i + 1] as Cue));
    set({ cues, sel: i });
    get().save();
    return true;
  },

  sortCues: () => {
    get().commit();
    set((s) => ({ cues: sorted(s.cues) }));
    get().save();
  },

  clearCues: () => {
    get().commit();
    set({ cues: [], sel: -1, liveIndex: -1 });
    get().save();
  },

  dragCue: (index, next) =>
    set((s) => {
      const cues = [...s.cues];
      const c = cues[index];
      if (!c) return {};
      cues[index] = { ...c, ...next };
      return { cues };
    }),

  undo: () => {
    const s = get();
    const prev = s.past[s.past.length - 1];
    if (!prev) return s.notify('Nothing to undo', true);
    set({
      past: s.past.slice(0, -1),
      future: [...s.future, snapshot(s)].slice(-MAX_HISTORY),
      cues: prev.cues,
      sel: prev.sel,
    });
    s.save();
  },

  redo: () => {
    const s = get();
    const next = s.future[s.future.length - 1];
    if (!next) return s.notify('Nothing to redo', true);
    set({
      future: s.future.slice(0, -1),
      past: [...s.past, snapshot(s)].slice(-MAX_HISTORY),
      cues: next.cues,
      sel: next.sel,
    });
    s.save();
  },

  /* ---------------- style ---------------- */
  setStyle: (patch) => {
    set((s) => ({ style: { ...s.style, ...patch } }));
    get().save();
  },
  resetStyle: () => {
    set({ style: freshStyle() });
    get().save();
  },

  /* ---------------- timeline ---------------- */
  setZoom: (zoom, now) =>
    set((s) => ({ zoom, view: clamp(now - zoom / 2, 0, Math.max(0, s.dur - zoom)) })),
  setView: (view) => set({ view }),

  /* ---------------- jobs ---------------- */
  setStatus: (patch) => set((s) => ({ status: { ...s.status, active: true, ...patch } })),
  clearStatus: () => set({ status: IDLE_STATUS }),
  setTranscribing: (transcribing) =>
    set(transcribing ? { transcribing, cancelASR: false } : { transcribing }),
  setRecording: (recording) =>
    set(recording ? { recording, cancelExport: false } : { recording }),
  requestCancel: () =>
    set((s) => ({
      cancelASR: s.transcribing ? true : s.cancelASR,
      cancelExport: s.recording ? true : s.cancelExport,
    })),

  /* ---------------- prefs ---------------- */
  setAsr: (patch) => set((s) => ({ asr: { ...s.asr, ...patch } })),
  setExportPrefs: (patch) => set((s) => ({ exportPrefs: { ...s.exportPrefs, ...patch } })),

  /* ---------------- persistence ---------------- */
  save: () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const s = get();
      persist(s.file?.name ?? null, s.cues, s.style);
    }, 400);
  },
}));

/** Read state from outside React — the render loop and the exporters use this. */
export const snap = (): AppState & AppActions => useStore.getState();
