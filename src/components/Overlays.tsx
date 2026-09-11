import { useEffect } from 'react';
import { useStore } from '../state/store';
import { Modal } from './ui/Modal';
import css from './Overlays.module.css';

const TOAST_MS = 2600;
const TOAST_BAD_MS = 5200;

export function Toast() {
  const toast = useStore((s) => s.toast);
  const dismiss = useStore((s) => s.dismissToast);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(dismiss, toast.bad ? TOAST_BAD_MS : TOAST_MS);
    return () => clearTimeout(t);
  }, [toast, dismiss]);

  if (!toast) return null;
  return (
    <div
      key={toast.id}
      className={`${css.toast} ${toast.bad ? css.bad : ''}`}
      role="status"
      aria-live="polite"
    >
      {toast.msg}
    </div>
  );
}

export function ConfirmDialog() {
  const req = useStore((s) => s.confirm);
  const resolve = useStore((s) => s.resolveConfirm);
  if (!req) return null;

  return (
    <Modal
      title={req.title}
      labelledBy="confirm-title"
      onClose={() => resolve(false)}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={() => resolve(false)}>
            Cancel
          </button>
          <button
            type="button"
            className={req.danger ? 'btn red' : 'btn amber'}
            onClick={() => resolve(true)}
          >
            {req.confirmLabel}
          </button>
        </>
      }
    >
      <p>{req.body}</p>
    </Modal>
  );
}

const SHORTCUTS: ReadonlyArray<[string, string]> = [
  ['Space', 'Play / pause'],
  ['← / →', 'Nudge 1s · Shift 5s · Alt 0.1s'],
  ['N', 'New cue at the playhead'],
  ['[', "Set the selected cue's in point"],
  [']', "Set the selected cue's out point"],
  ['S', 'Split the selected cue at the playhead'],
  ['Del', 'Delete the selected cue'],
  ['Tab', "Inside a cue: jump to the next cue's text"],
  ['Ctrl+Z', 'Undo · Ctrl+Shift+Z to redo'],
  ['Ctrl+S', 'Download an .srt right away'],
  ['Esc', 'Cancel a drag / close this box'],
];

export function ShortcutsModal() {
  const open = useStore((s) => s.shortcutsOpen);
  const setOpen = useStore((s) => s.setShortcuts);
  if (!open) return null;

  return (
    <Modal title="Shortcuts" labelledBy="shortcuts-title" onClose={() => setOpen(false)}>
      <div className={css.keys}>
        {SHORTCUTS.map(([k, d]) => (
          <div key={k} style={{ display: 'contents' }}>
            <kbd>{k}</kbd>
            <span>{d}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}

export function AboutModal() {
  const open = useStore((s) => s.aboutOpen);
  const setOpen = useStore((s) => s.setAbout);
  if (!open) return null;

  return (
    <Modal title="About Subdeck" labelledBy="about-title" onClose={() => setOpen(false)}>
      <p>
        A subtitle editor that runs entirely in your browser. Nothing is uploaded — there is no
        account, no server, no quota and no watermark.
      </p>
      <dl className={css.facts}>
        <dt>Decode</dt>
        <dd>your browser</dd>
        <dt>Speech</dt>
        <dd>Whisper, on your own CPU/GPU</dd>
        <dt>Weights</dt>
        <dd>Apache-2.0, from a public CDN</dd>
        <dt>Encode</dt>
        <dd>WebCodecs, built into your browser</dd>
      </dl>
      <p>
        The only network traffic is the one-time model download and the webfonts. Cues are saved
        per video file in this browser, so switching between videos keeps each one's captions;
        styling is shared across all of them.
      </p>
      <p>
        <b>Worth knowing:</b> burn-in is a re-encode and so mildly lossy — sidecar{' '}
        <code>.srt</code> files are lossless. Files over about an hour use a lot of memory, since
        the whole audio track is decoded up front. Chrome and Edge give the best results.
      </p>
    </Modal>
  );
}
