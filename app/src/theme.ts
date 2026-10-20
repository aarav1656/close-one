import {scaleFontSize, scaleWidth} from './shared/utils/scaling';

export const color = {
  canvas: '#0B1220',
  panel: '#141E33',
  panelFocus: '#1D2B49',
  text: '#F4EFE6',
  muted: '#9AA6BC',
  amber: '#FFB400',
  amberDim: '#5A4300',
  line: '#26334F',
};

// 10-foot type: nothing under 34 px at 1080p.
export const type = {
  hero: scaleFontSize(96),
  title: scaleFontSize(64),
  body: scaleFontSize(40),
  label: scaleFontSize(34),
};

export const space = (n: number) => scaleWidth(n);
