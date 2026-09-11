import type { ReactNode } from 'react';
import css from './controls.module.css';

export function Group({
  title,
  info,
  children,
}: {
  title: string;
  info?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={css.group}>
      <div className={css.groupHead}>
        <span className="lbl">{title}</span>
        {info}
      </div>
      {children}
    </section>
  );
}

export function Row({
  label,
  children,
  align,
}: {
  label: string;
  children: ReactNode;
  align?: 'start';
}) {
  return (
    <div className={css.row} style={align === 'start' ? { alignItems: 'flex-start' } : undefined}>
      <span className={css.rowLabel} style={align === 'start' ? { paddingTop: 5 } : undefined}>
        {label}
      </span>
      <div className={css.field}>{children}</div>
    </div>
  );
}

export const Actions = ({ children }: { children: ReactNode }) => (
  <div className={css.actions}>{children}</div>
);

export interface SegOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: ReadonlyArray<SegOption<T>>;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div className={css.seg} role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          disabled={o.disabled ?? false}
          className={o.value === value ? css.on : undefined}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A range input that shows its own value — the pattern every style row uses. */
export function Slider({
  label,
  value,
  min,
  max,
  step,
  suffix = '',
  onChange,
  children,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (v: number) => void;
  /** Anything to sit before the slider, e.g. a colour swatch. */
  children?: ReactNode;
}) {
  return (
    <Row label={label}>
      {children}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className={css.value}>
        {value}
        {suffix}
      </span>
    </Row>
  );
}

export const Value = ({ children }: { children: ReactNode }) => (
  <span className={css.value}>{children}</span>
);
