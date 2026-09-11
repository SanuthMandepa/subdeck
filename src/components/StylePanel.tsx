import { paintPreview } from '../engine/loop';
import { FONTS, PRESETS } from '../lib/style';
import type { Align, CaptionMode, CaptionStyle } from '../lib/types';
import { useStore } from '../state/store';
import { Actions, Group, Row, Segmented, Slider } from './ui/Controls';
import { Info } from './ui/Info';
import css from './StylePanel.module.css';

const MAX_PALETTE = 10;

export function StylePanel() {
  const style = useStore((s) => s.style);
  const setStyle = useStore((s) => s.setStyle);
  const resetStyle = useStore((s) => s.resetStyle);
  const notify = useStore((s) => s.notify);
  const ask = useStore((s) => s.ask);

  /* Every edit repaints immediately — with the video paused nothing else would. */
  const set = (patch: Partial<CaptionStyle>) => {
    setStyle(patch);
    paintPreview();
  };

  const onFont = async (font: string) => {
    set({ font });
    try {
      await document.fonts.load(`700 40px "${font}"`);
    } catch {
      /* the fallback stack covers it */
    }
    paintPreview();
  };

  const onReset = async () => {
    const ok = await ask({
      title: 'Reset styling?',
      body: 'Every styling option goes back to its default. Your cues are not affected.',
      confirmLabel: 'Reset',
      danger: true,
    });
    if (!ok) return;
    resetStyle();
    paintPreview();
    notify('Styling reset');
  };

  const setPalette = (next: string[]) => set({ palette: next });

  return (
    <>
      <Group
        title="Caption style"
        info={
          <Info label="caption style">
            <p>
              <b>Classic</b> puts the whole line on screen at once and exports cleanly to{' '}
              <code>.srt</code> and <code>.vtt</code>.
            </p>
            <p>
              <b>Word pop</b> raises words into place one at a time, each in its own colour.
              Burn-in only — <code>.srt</code> has no way to express it.
            </p>
          </Info>
        }
      >
        <Segmented<CaptionMode>
          ariaLabel="Caption style"
          value={style.mode}
          onChange={(mode) => set({ mode })}
          options={[
            { value: 'classic', label: 'CLASSIC' },
            { value: 'pop', label: 'WORD POP' },
          ]}
        />
      </Group>

      <Group title="Typeface">
        <Row label="Font">
          <select value={style.font} onChange={(e) => void onFont(e.target.value)} aria-label="Font">
            {FONTS.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </Row>
        <Slider label="Size" value={style.size} min={2} max={16} step={0.1} onChange={(size) => set({ size })} />
        <Row label="Weight">
          <Segmented
            ariaLabel="Font weight"
            value={String(style.weight)}
            onChange={(v) => set({ weight: Number(v) })}
            options={[
              { value: '400', label: 'REGULAR' },
              { value: '700', label: 'BOLD' },
              { value: '900', label: 'BLACK' },
            ]}
          />
        </Row>
        <Slider label="Line gap" value={style.lineGap} min={1} max={1.8} step={0.01} onChange={(lineGap) => set({ lineGap })} />
        <Row label="Uppercase">
          <input
            type="checkbox"
            checked={style.upper}
            onChange={(e) => set({ upper: e.target.checked })}
            aria-label="Uppercase"
          />
        </Row>
      </Group>

      <Group
        title="Colour & legibility"
        info={
          <Info label="legibility">
            <p>
              Outline width and plate opacity are what keep captions readable over bright or busy
              footage. Outline is a percentage of the type size, so it scales with it.
            </p>
          </Info>
        }
      >
        <Row label="Text">
          <input
            type="color"
            value={style.color}
            onChange={(e) => set({ color: e.target.value })}
            aria-label="Text colour"
          />
          {style.mode === 'pop' && <span className="hint">word pop uses the palette below</span>}
        </Row>
        <Slider label="Outline" value={style.outline} min={0} max={40} step={1} onChange={(outline) => set({ outline })}>
          <input
            type="color"
            value={style.outlineColor}
            onChange={(e) => set({ outlineColor: e.target.value })}
            aria-label="Outline colour"
          />
        </Slider>
        <Slider label="Background" value={style.box} min={0} max={100} step={1} onChange={(box) => set({ box })}>
          <input
            type="color"
            value={style.boxColor}
            onChange={(e) => set({ boxColor: e.target.value })}
            aria-label="Background colour"
          />
        </Slider>
        <Row label="Drop shadow">
          <input
            type="checkbox"
            checked={style.shadow}
            onChange={(e) => set({ shadow: e.target.checked })}
            aria-label="Drop shadow"
          />
        </Row>
      </Group>

      {style.mode === 'pop' && (
        <Group
          title="Word pop"
          info={
            <Info label="word pop">
              <p>
                Each word rises into place as it is spoken, taking the next colour in the row.
                Whisper's word-level timing drives it; on hand-typed cues the words are spaced
                evenly across the cue instead.
              </p>
            </Info>
          }
        >
          <Row label="Word colours" align="start">
            <div className={css.palette}>
              {style.palette.map((col, i) => (
                <input
                  key={i}
                  type="color"
                  value={col}
                  title={`Word colour ${i + 1}`}
                  aria-label={`Word colour ${i + 1}`}
                  onChange={(e) => {
                    const next = [...style.palette];
                    next[i] = e.target.value;
                    setPalette(next);
                  }}
                />
              ))}
              <button
                type="button"
                className="btn ghost sm"
                title="Fewer colours"
                disabled={style.palette.length <= 1}
                onClick={() => setPalette(style.palette.slice(0, -1))}
              >
                −
              </button>
              <button
                type="button"
                className="btn ghost sm"
                title="Another colour"
                disabled={style.palette.length >= MAX_PALETTE}
                onClick={() => setPalette([...style.palette, '#ffffff'])}
              >
                +
              </button>
            </div>
          </Row>

          <Row label="Colour by">
            <Segmented
              ariaLabel="Colour by"
              value={style.perLineColor ? 'line' : 'word'}
              onChange={(v) => set({ perLineColor: v === 'line' })}
              options={[
                { value: 'word', label: 'EACH WORD' },
                { value: 'line', label: 'EACH LINE' },
              ]}
            />
          </Row>

          <Slider label="Rise height" value={style.rise} min={0} max={200} step={5} suffix="%" onChange={(rise) => set({ rise })} />
          <Slider label="Rise speed" value={style.animMs} min={60} max={600} step={10} suffix="ms" onChange={(animMs) => set({ animMs })} />
          <Slider label="Pop scale" value={style.popScale} min={0} max={60} step={1} suffix="%" onChange={(popScale) => set({ popScale })} />
          <Slider label="Ghost ahead" value={style.ghost} min={0} max={60} step={1} suffix="%" onChange={(ghost) => set({ ghost })} />
        </Group>
      )}

      <Group
        title="Placement"
        info={
          <Info label="placement">
            <p>
              <b>Drag the caption on the video</b> to place it — these sliders follow along.
            </p>
            <p>
              Sizes are a percentage of the frame, so the preview matches the export exactly at any
              resolution.
            </p>
          </Info>
        }
      >
        <Row label="Align">
          <Segmented<Align>
            ariaLabel="Alignment"
            value={style.align}
            onChange={(align) => set({ align })}
            options={[
              { value: 'left', label: 'LEFT' },
              { value: 'center', label: 'CENTER' },
              { value: 'right', label: 'RIGHT' },
            ]}
          />
        </Row>
        <Slider label="Height" value={style.bottom} min={0} max={92} step={0.5} suffix="%" onChange={(bottom) => set({ bottom })} />
        <Slider label="Sideways" value={style.xOffset} min={-45} max={45} step={0.5} suffix="%" onChange={(xOffset) => set({ xOffset })} />
        <Slider label="Max width" value={style.width} min={30} max={100} step={1} suffix="%" onChange={(width) => set({ width })} />
        <Actions>
          <button type="button" className="btn ghost sm" onClick={() => set({ xOffset: 0 })}>
            Re-centre
          </button>
        </Actions>
      </Group>

      <Group title="Presets">
        <Actions>
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="btn ghost sm"
              onClick={() => {
                set({ ...p.style, palette: p.style.palette ? [...p.style.palette] : style.palette });
                notify(`Applied the ${p.label.toLowerCase()} preset`);
              }}
            >
              {p.label}
            </button>
          ))}
        </Actions>
        <Actions>
          <button type="button" className="btn ghost sm" onClick={() => void onReset()}>
            Reset all styling
          </button>
        </Actions>
      </Group>
    </>
  );
}
