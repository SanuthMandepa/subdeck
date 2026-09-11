import { useEffect, useRef, useState } from 'react';
import { startLoop, stopLoop } from './engine/loop';
import { acceptFile } from './engine/source';
import { lastProject } from './lib/storage';
import { useStore } from './state/store';
import { useKeyboard } from './hooks/useKeyboard';
import { Header } from './components/Header';
import { Rack } from './components/Rack';
import { Stage } from './components/Stage';
import { Timeline } from './components/Timeline';
import { Transport } from './components/Transport';
import { AboutModal, ConfirmDialog, ShortcutsModal, Toast } from './components/Overlays';
import css from './App.module.css';

export default function App() {
  const [dragging, setDragging] = useState(false);
  const filePick = useRef<HTMLInputElement>(null);
  const notify = useStore((s) => s.notify);

  useKeyboard();

  useEffect(() => {
    startLoop();
    return stopLoop;
  }, []);

  /* Remind the user that work is waiting, since a browser can never hand a
     page back the file it had last time. */
  useEffect(() => {
    const last = lastProject();
    if (!last) return;
    const t = setTimeout(
      () => notify(`${last.count} saved cues waiting for "${last.name}" — load that video to see them`),
      900,
    );
    return () => clearTimeout(t);
  }, [notify]);

  /* Drag and drop anywhere on the page. */
  useEffect(() => {
    const over = (e: DragEvent) => {
      e.preventDefault();
      setDragging(true);
    };
    const leave = (e: DragEvent) => {
      e.preventDefault();
      if (e.relatedTarget === null) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer?.files?.[0];
      if (f) acceptFile(f);
    };
    addEventListener('dragenter', over);
    addEventListener('dragover', over);
    addEventListener('dragleave', leave);
    addEventListener('drop', drop);
    return () => {
      removeEventListener('dragenter', over);
      removeEventListener('dragover', over);
      removeEventListener('dragleave', leave);
      removeEventListener('drop', drop);
    };
  }, []);

  const pick = () => filePick.current?.click();

  return (
    <div className={css.app}>
      <Header onPick={pick} />

      <main className={css.main}>
        <section className={css.stage}>
          <Stage dragging={dragging} onPick={pick} />
          <Transport />
          <Timeline />
        </section>
        <Rack />
      </main>

      <Toast />
      <ConfirmDialog />
      <ShortcutsModal />
      <AboutModal />

      <input
        ref={filePick}
        type="file"
        accept="video/*,audio/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) acceptFile(f);
        }}
      />
    </div>
  );
}
