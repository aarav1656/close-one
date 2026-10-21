import ReactTestRenderer from 'react-test-renderer';
import * as api from '../src/api';

type Json = ReactTestRenderer.ReactTestRendererJSON | string;
const textOf = (n: Json | null): string[] => {
  if (n === null) {
    return [];
  }
  if (typeof n === 'string') {
    return [n];
  }
  const kids = (n.children ?? []) as Json[];
  // A Text node is one run of words; anything else just passes its children up.
  return n.type === 'Text' ? [kids.map(k => (typeof k === 'string' ? k : textOf(k).join(''))).join('')] : kids.flatMap(textOf);
};
/** Everything the screen says, one line per Text node. */
export const asText = (r: ReactTestRenderer.ReactTestRenderer) => {
  const j = r.toJSON();
  return (Array.isArray(j) ? (j as Json[]).flatMap(textOf) : textOf(j as Json | null)).join('\n');
};
export const flush = () => ReactTestRenderer.act(async () => {});

export const game = (over: Partial<api.GameView> = {}): api.GameView => ({
  id: 'g1', home: 'Spurs', away: 'Thunder', label: 'Thunder at Spurs', status: 'live', period: 4, clock: 192, pressure: 0.8, followed: true, ...over,
});

export const baseState: api.ServerState = {
  active: null,
  tonight: {cues: 1, cap: 2, quiet: false},
  follow: ['SA'],
  games: [game()],
  upcoming: [],
  feed: {ok: true, ageMs: 4000},
  learning: {base: 0.3, min: 0.15, max: 0.6, threshold: 0.35, cues: [{cueId: 1, team: 'SA', lev: 0.38, threshold: 0.3, action: 'dismiss', after: 0.35, period: 4, clock: 252}]},
};

export async function mount(el: React.ReactElement) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    r = ReactTestRenderer.create(el);
  });
  await flush();
  return r;
}

export const press = (r: ReactTestRenderer.ReactTestRenderer, label: string) =>
  ReactTestRenderer.act(async () => {
    r.root.findByProps({accessibilityLabel: label}).props.onPress();
  });

/** Every pressable control on screen, by label, and how many of them ask for first focus. */
export function controls(r: ReactTestRenderer.ReactTestRenderer) {
  const nodes = r.root.findAll(n => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function' && typeof n.type !== 'string');
  const seen = new Map<string, boolean>();
  for (const n of nodes) {
    seen.set(n.props.accessibilityLabel, !!n.props.hasTVPreferredFocus);
  }
  return {labels: [...seen.keys()], preferred: [...seen.entries()].filter(([, p]) => p).map(([l]) => l)};
}
