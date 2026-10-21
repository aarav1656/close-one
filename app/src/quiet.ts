import {Quiet} from './api';

export const QUIET_PRESETS: {label: string; quiet: Quiet | null}[] = [
  {label: 'No quiet hours', quiet: null},
  {label: '10 pm to 7 am', quiet: {from: 22, to: 7}},
  {label: '11 pm to 6 am', quiet: {from: 23, to: 6}},
  {label: 'Midnight to 8 am', quiet: {from: 0, to: 8}},
];

const hour = (h: number): string => (h === 0 ? 'midnight' : `${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}`);

export const sameQuiet = (a: Quiet | null, b: Quiet | null): boolean => (a === null || b === null ? a === b : a.from === b.from && a.to === b.to);

/** "10 pm to 7 am", or "None" when the household has no quiet hours. */
export const quietLabel = (q: Quiet | null): string =>
  q === null ? 'None' : QUIET_PRESETS.find(p => sameQuiet(p.quiet, q))?.label ?? `${hour(q.from)} to ${hour(q.to)}`;
