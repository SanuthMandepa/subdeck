import { useStore, type Tab } from '../state/store';
import { CuePanel } from './CuePanel';
import { ExportPanel } from './ExportPanel';
import { StylePanel } from './StylePanel';
import css from './Rack.module.css';

const TABS: ReadonlyArray<[Tab, string]> = [
  ['cues', 'Cues'],
  ['style', 'Style'],
  ['export', 'Export'],
];

export function Rack() {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const count = useStore((s) => s.cues.length);

  return (
    <aside className={css.rack}>
      <div className={css.tabs} role="tablist" aria-label="Editor panels">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`pane-${id}`}
            className={tab === id ? css.on : undefined}
            onClick={() => setTab(id)}
          >
            {label}
            {id === 'cues' && <span className={css.count}>{count}</span>}
          </button>
        ))}
      </div>

      <div className={css.pane} role="tabpanel" id={`pane-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'cues' && <CuePanel />}
        {tab === 'style' && <StylePanel />}
        {tab === 'export' && <ExportPanel />}
      </div>
    </aside>
  );
}
