import { useEffect } from 'react';
import { video } from '../engine/media';
import { snap } from '../state/store';
import { useEditorActions } from './useEditorActions';

const isTypingTarget = (el: EventTarget | null): boolean =>
  el instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);

/** The global key map. Modal and drag handlers stop propagation before this. */
export function useKeyboard() {
  const a = useEditorActions();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = snap();
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        return a.downloadSrt();
      }
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        return e.shiftKey ? s.redo() : s.undo();
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        return s.redo();
      }

      // Everything below is a bare key, so never steal it from a text box.
      if (isTypingTarget(e.target) || mod) return;
      if (s.confirm || s.shortcutsOpen || s.aboutOpen) return;

      const step = e.altKey ? 0.1 : e.shiftKey ? 5 : 1;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          return a.togglePlay();
        case 'ArrowLeft':
          e.preventDefault();
          return a.nudge(-step);
        case 'ArrowRight':
          e.preventDefault();
          return a.nudge(step);
        case '[':
          return a.setIn();
        case ']':
          return a.setOut();
        case 'Delete':
        case 'Backspace':
          if (s.sel < 0) return;
          e.preventDefault();
          return a.deleteSelected();
        default:
          break;
      }

      const k = e.key.toLowerCase();
      if (k === 'n') {
        e.preventDefault();
        return a.newCue();
      }
      if (k === 's' && s.sel >= 0) return a.splitSelected();
    };

    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [a]);

  /* Don't let a refresh silently kill a running job. */
  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      const s = snap();
      if (s.recording || s.transcribing) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    addEventListener('beforeunload', onLeave);
    return () => removeEventListener('beforeunload', onLeave);
  }, []);

  /* Pause on unmount so a hot reload cannot leave audio playing. */
  useEffect(() => () => void video.pause(), []);
}
