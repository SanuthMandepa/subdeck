import type { CaptionStyle } from './types';

export const DEFAULT_STYLE: CaptionStyle = {
  mode: 'classic',
  font: 'Archivo',
  size: 5.6,
  weight: 700,
  upper: false,
  color: '#ffffff',
  outline: 14,
  outlineColor: '#000000',
  box: 45,
  boxColor: '#000000',
  shadow: true,
  bottom: 7,
  xOffset: 0,
  width: 82,
  align: 'center',
  lineGap: 1.22,
  // word-pop
  palette: ['#ffe66b', '#7ee392', '#54d7e8', '#ff8fa3', '#ffb43d', '#c4a5ff'],
  rise: 70,
  animMs: 180,
  ghost: 0,
  popScale: 14,
  perLineColor: false,
};

export const freshStyle = (): CaptionStyle => ({
  ...DEFAULT_STYLE,
  palette: [...DEFAULT_STYLE.palette],
});

export const FONTS = [
  'Archivo',
  'Chivo Mono',
  'Arial',
  'Helvetica',
  'Verdana',
  'Tahoma',
  'Trebuchet MS',
  'Georgia',
  'Times New Roman',
  'Courier New',
  'Impact',
] as const;

export interface Preset {
  id: string;
  label: string;
  style: Partial<CaptionStyle>;
}

export const PRESETS: Preset[] = [
  {
    id: 'broadcast',
    label: 'Broadcast',
    style: {
      mode: 'classic', font: 'Archivo', size: 5.6, weight: 700, upper: false,
      color: '#ffffff', outline: 14, outlineColor: '#000000', box: 45,
      boxColor: '#000000', shadow: true, bottom: 7, xOffset: 0, width: 82,
      align: 'center', lineGap: 1.22,
    },
  },
  {
    id: 'karaoke',
    label: 'Word pop',
    style: {
      mode: 'pop', font: 'Archivo', size: 8.4, weight: 900, upper: true,
      color: '#ffffff', outline: 30, outlineColor: '#000000', box: 0,
      boxColor: '#000000', shadow: true, bottom: 26, xOffset: 0, width: 76,
      align: 'center', lineGap: 1.14, rise: 80, animMs: 170, popScale: 16,
      ghost: 0, perLineColor: false,
      palette: ['#ffe66b', '#7ee392', '#54d7e8', '#ff8fa3', '#ffb43d', '#c4a5ff'],
    },
  },
  {
    id: 'social',
    label: 'Social bold',
    style: {
      mode: 'classic', font: 'Archivo', size: 8.2, weight: 900, upper: true,
      color: '#ffe66b', outline: 26, outlineColor: '#000000', box: 0,
      boxColor: '#000000', shadow: true, bottom: 22, xOffset: 0, width: 74,
      align: 'center', lineGap: 1.1,
    },
  },
  {
    id: 'netflix',
    label: 'Clean plate',
    style: {
      mode: 'classic', font: 'Arial', size: 5, weight: 400, upper: false,
      color: '#ffffff', outline: 0, outlineColor: '#000000', box: 70,
      boxColor: '#000000', shadow: false, bottom: 8, xOffset: 0, width: 80,
      align: 'center', lineGap: 1.25,
    },
  },
  {
    id: 'minimal',
    label: 'Hairline',
    style: {
      mode: 'classic', font: 'Georgia', size: 4.4, weight: 400, upper: false,
      color: '#f4f1ea', outline: 8, outlineColor: '#000000', box: 0,
      boxColor: '#000000', shadow: true, bottom: 9, xOffset: 0, width: 70,
      align: 'center', lineGap: 1.3,
    },
  },
];
