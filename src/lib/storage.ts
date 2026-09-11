import { DEFAULT_STYLE, freshStyle } from './style';
import type { CaptionStyle, Cue } from './types';
import { uid } from './util';

const KEY = 'subdeck.v2';
/** Keep localStorage from growing without bound. */
const MAX_PROJECTS = 20;

interface Project {
  cues: Cue[];
  at: number;
}

interface Store {
  style?: CaptionStyle;
  projects?: Record<string, Project>;
  last?: string;
}

function readStore(): Store {
  try {
    return (JSON.parse(localStorage.getItem(KEY) || '{}') as Store) || {};
  } catch {
    return {};
  }
}

function writeStore(s: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch (err) {
    console.warn('save failed', err);
  }
}

/** Styling is global; cues are stored per video filename. */
export function persist(fileName: string | null, cues: Cue[], style: CaptionStyle): void {
  const store = readStore();
  store.style = style;
  store.projects = store.projects || {};

  if (fileName) {
    if (cues.length) store.projects[fileName] = { cues, at: Date.now() };
    else delete store.projects[fileName];

    const names = Object.keys(store.projects).sort(
      (a, b) => (store.projects?.[b]?.at ?? 0) - (store.projects?.[a]?.at ?? 0),
    );
    names.slice(MAX_PROJECTS).forEach((n) => delete store.projects?.[n]);
    store.last = fileName;
  }
  writeStore(store);
}

export function loadProject(name: string): Cue[] | null {
  const p = readStore().projects?.[name];
  if (!p || !Array.isArray(p.cues)) return null;
  return p.cues.map((c) => ({ ...c, id: c.id || uid() }));
}

export function loadStyle(): CaptionStyle {
  const saved = readStore().style;
  if (!saved) return freshStyle();
  const style = { ...DEFAULT_STYLE, ...saved };
  if (!Array.isArray(style.palette) || !style.palette.length) {
    style.palette = [...DEFAULT_STYLE.palette];
  }
  return style;
}

/** The most recently used file, if it still has cues waiting for it. */
export function lastProject(): { name: string; count: number } | null {
  const store = readStore();
  const name = store.last;
  const count = name ? store.projects?.[name]?.cues?.length ?? 0 : 0;
  return name && count ? { name, count } : null;
}
