import { LANGS, MODELS } from '../engine/asr';
import { useStore } from '../state/store';
import { Group, Row, Segmented, Value } from './ui/Controls';
import { Info } from './ui/Info';

export function AsrSettings() {
  const asr = useStore((s) => s.asr);
  const setAsr = useStore((s) => s.setAsr);
  const gpu = typeof navigator !== 'undefined' && !!navigator.gpu;

  return (
    <Group
      title="Auto-transcribe settings"
      info={
        <Info label="auto-transcribe">
          <p>
            Whisper runs on your own machine through <code>transformers.js</code>. The model
            downloads once (40–250&nbsp;MB) and is cached by the browser, so later runs work
            offline.
          </p>
          <p>
            Accuracy is good but not perfect — proper nouns, overlapping speech and heavy accents
            need a review pass.
          </p>
        </Info>
      }
    >
      <Row label="Model">
        <select value={asr.model} onChange={(e) => setAsr({ model: e.target.value })} aria-label="Model">
          {MODELS.map(([v, t]) => (
            <option key={v} value={v}>
              {t}
            </option>
          ))}
        </select>
      </Row>

      <Row label="Language">
        <select value={asr.lang} onChange={(e) => setAsr({ lang: e.target.value })} aria-label="Language">
          {LANGS.map(([v, t]) => (
            <option key={v} value={v}>
              {t}
            </option>
          ))}
        </select>
      </Row>

      <Row label="Output">
        <Segmented
          ariaLabel="Transcript output"
          value={asr.translate ? 'translate' : 'original'}
          onChange={(v) => setAsr({ translate: v === 'translate' })}
          options={[
            { value: 'original', label: 'ORIGINAL' },
            { value: 'translate', label: 'TRANSLATE → EN' },
          ]}
        />
      </Row>

      <Row label="Word timing">
        <input
          type="checkbox"
          checked={asr.words}
          onChange={(e) => setAsr({ words: e.target.checked })}
          aria-label="Word-level timing"
        />
        <span className="hint">needed for word pop</span>
      </Row>

      <Row label="Words / line">
        <input
          type="range"
          min={1}
          max={12}
          step={1}
          value={asr.perLine}
          aria-label="Words per line"
          onChange={(e) => setAsr({ perLine: Number(e.target.value) })}
        />
        <Value>{asr.perLine}</Value>
      </Row>

      <Row label="Use GPU">
        <input
          type="checkbox"
          checked={asr.gpu}
          disabled={!gpu}
          onChange={(e) => setAsr({ gpu: e.target.checked })}
          aria-label="Use WebGPU"
        />
        <span className="hint">{gpu ? 'WebGPU available' : 'no WebGPU — CPU will be slow'}</span>
      </Row>
    </Group>
  );
}
