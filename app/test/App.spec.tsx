import {Linking} from 'react-native';
import * as React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {App} from '../src/App';
import {CUE_SERVICE_URI} from '../src/config';
import * as api from '../src/api';
import {asText, baseState, controls, flush, game, mount, press} from './helpers';
import {color, space} from '../src/theme';

jest.mock('@amazon-devices/react-native-async-storage__async-storage', () =>
  require('@amazon-devices/react-native-async-storage__async-storage/jest/async-storage-mock'),
);

const notOnboarded: api.Settings = {onboarded: false, enabled: true, quiet: null, paused: false, silence: null};

const teams: api.Team[] = [
  {abbr: 'NY', city: 'New York', nick: 'Knicks', name: 'New York Knicks'},
  {abbr: 'SA', city: 'San Antonio', nick: 'Spurs', name: 'San Antonio Spurs'},
  {abbr: 'BOS', city: 'Boston', nick: 'Celtics', name: 'Boston Celtics'},
];

const showcase: api.Showcase = {
  label: 'Bucks at Hawks',
  date: '20260119',
  from: 2520,
  total: 2880,
  bar: 0.3,
  ticks: [{t: 2520, label: '4th 6:00'}, {t: 2580, label: '5:00'}, {t: 2640, label: '4:00'}],
  series: Array.from({length: 96}, (_, i) => (i > 90 ? 0.45 : 0.1)),
  rule: [
    {t: 2638, at: '4th 4:02', lev: 0.18, verdict: 'below', why: 'Within 5 points with under 5 minutes left. Clutch waits: only 18 points of win chance at stake, under the bar of 30.'},
    {t: 2683, at: '4th 3:17', lev: 0.24, verdict: 'below', why: 'Within 5 points with under 5 minutes left. Clutch waits: only 24 points of win chance at stake, under the bar of 30.'},
  ],
  clutch: [{t: 2733, at: '4th 2:27', lev: 0.48, why: 'The next possession can move the win chance by 48 points, over the bar of 30. 2 simple alerts had already gone out.'}],
  summary: 'The simple rule alerts 2 times. Clutch cues once, first at 4th 2:27 with 48 points of win chance on the next possession.',
};

let mounted: ReactTestRenderer.ReactTestRenderer | undefined;
const show = async (state: api.ServerState | Error) => {
  jest.spyOn(api, 'getState').mockImplementation(() => (state instanceof Error ? Promise.reject(state) : Promise.resolve(state)));
  mounted = await mount(<App />);
  return mounted;
};

describe('Clutch app', () => {
  beforeEach(() => {
    jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    jest.spyOn(api, 'getTeams').mockResolvedValue(teams);
  });
  afterEach(async () => {
    await ReactTestRenderer.act(async () => mounted?.unmount());
    mounted = undefined;
    jest.restoreAllMocks();
  });

  it('starts the cue service and shows tonight’s budget and the games of followed teams', async () => {
    const r = await show(baseState);
    expect(Linking.openURL).toHaveBeenCalledWith(CUE_SERVICE_URI);
    expect(asText(r)).toContain('1 of 2 interruptions left tonight');
    expect(asText(r)).toContain('Your teams tonight');
    expect(asText(r)).toContain('Thunder at Spurs');
    expect(asText(r)).toContain('4th 3:12');
  });

  it('a TV that has not opted in lands on setup step 1, not on a game', async () => {
    const r = await show({...baseState, follow: [], settings: notOnboarded, games: [game({followed: false})]});
    expect(asText(r)).toContain('STEP 1 OF 3');
    expect(asText(r)).toContain('Pick the teams you follow');
    expect(asText(r)).toContain('Knicks');
    expect(asText(r)).not.toContain('Your teams tonight');
  });

  it('setup: teams, quiet hours, then Turn cues on is the only thing that opts in', async () => {
    const follow = jest.spyOn(api, 'setFollow').mockResolvedValue(['NY', 'BOS']);
    const settings = jest.spyOn(api, 'setSettings').mockResolvedValue({...baseState.settings});
    const r = await show({...baseState, follow: [], settings: notOnboarded, games: []});
    await press(r, 'Knicks');
    await press(r, 'Celtics');
    await press(r, 'Next, following 2');
    await flush();
    expect(follow).toHaveBeenCalledWith(['NY', 'BOS']);
    expect(asText(r)).toContain('STEP 2 OF 3');
    expect(settings).not.toHaveBeenCalled();
    await press(r, '10 pm to 7 am');
    await press(r, 'Next');
    expect(asText(r)).toContain('STEP 3 OF 3');
    expect(asText(r)).toContain('Until you do, Clutch sends nothing.');
    expect(asText(r)).toContain('10 pm to 7 am');
    expect(settings).not.toHaveBeenCalled();
    await press(r, 'Turn cues on');
    await flush();
    expect(settings).toHaveBeenCalledWith({onboarded: true, enabled: true, quiet: {from: 22, to: 7}, offsetMin: -new Date().getTimezoneOffset()});
    expect(asText(r)).toContain('CLUTCH');
  });

  it('backing out of setup leaves cues off and offers setup from Home', async () => {
    const r = await show({...baseState, follow: [], settings: notOnboarded, games: []});
    await press(r, 'Back');
    expect(asText(r)).toContain('Set up Clutch');
    expect(controls(r).preferred).toEqual(['Set up Clutch']);
  });

  it('setup that cannot reach the server says so and does not leave setup', async () => {
    jest.spyOn(api, 'setFollow').mockResolvedValue([]);
    jest.spyOn(api, 'setSettings').mockRejectedValue(new Error('down'));
    const r = await show({...baseState, follow: [], settings: notOnboarded, games: []});
    await press(r, 'Next');
    await flush();
    await press(r, 'Next');
    await press(r, 'Turn cues on');
    await flush();
    expect(asText(r)).toContain('Could not reach the server');
    expect(asText(r)).toContain('STEP 3 OF 3');
  });

  it('tapping a team twice un-picks it', async () => {
    const save = jest.spyOn(api, 'setFollow').mockResolvedValue([]);
    const r = await show({...baseState, follow: [], settings: notOnboarded, games: []});
    await press(r, 'Knicks');
    await press(r, 'Knicks');
    expect(asText(r)).not.toContain('following');
    await press(r, 'Next');
    expect(save).toHaveBeenCalledWith([]);
  });

  it('a picker that cannot save says so and keeps the picks', async () => {
    jest.spyOn(api, 'setFollow').mockRejectedValue(new Error('down'));
    const r = await show({...baseState, follow: [], settings: notOnboarded, games: []});
    await press(r, 'Knicks');
    await press(r, 'Next, following 1');
    await flush();
    expect(asText(r)).toContain('Could not save');
    expect(asText(r)).toContain('Next, following 1');
  });

  it('puts the card in front for an active cue, sends accept on Watch, and never shows a score', async () => {
    const card = {id: 7, gameId: 'g1', title: 't', body: 'Coming down to the wire. 4th quarter, 3:12 left. Menu opens Clutch.', when: '4th quarter, 3:12 left', home: 'Spurs', away: 'Thunder', why: 'Close, and the next possession can move the win chance by 38 points.'};
    const fb = jest.spyOn(api, 'sendFeedback').mockResolvedValue();
    const r = await show({...baseState, active: card});
    expect(asText(r)).toContain('COMING DOWN TO THE WIRE');
    expect(asText(r)).toContain('Thunder');
    expect(asText(r)).not.toMatch(/\d+-\d+/);
    expect(asText(r)).toContain('4th quarter, 3:12 left');
    expect(asText(r)).not.toContain('Menu opens Clutch');
    expect(asText(r)).toContain('Pressure on the next possession');
    await press(r, 'Watch');
    expect(fb).toHaveBeenCalledWith(7, 'accept');
    expect(asText(r)).toContain('Pressure on the next possession');
  });

  it('Why this cue? shows pressure against the bar and the cues left tonight, with the reason; Hide reason folds it away', async () => {
    const why = 'Close, and the next possession can move the win chance by 38 points.';
    const whyData = {lev: 0.38, threshold: 0.3, base: 0.3, cap: 2, cuesLeft: 1};
    const r = await show({...baseState, active: {id: 9, gameId: 'g1', title: 't', body: 'x', home: 'Spurs', away: 'Thunder', why, whyData}});
    expect(asText(r)).not.toContain(why);
    expect(asText(r)).not.toContain('Your bar 30');
    await press(r, 'Why this cue?');
    const t = asText(r);
    expect(t).toContain('WHY THIS CUE');
    expect(t).toContain('Pressure 38');
    expect(t).toContain('Your bar 30');
    expect(t).toContain('1 of 2 cues left tonight after this one.');
    expect(t).toContain(why);
    await press(r, 'Hide reason');
    expect(asText(r)).not.toContain(why);
  });

  it('the last cue of the night says so', async () => {
    const r = await show({...baseState, active: {id: 9, gameId: 'g1', title: 't', body: 'x', home: 'Spurs', away: 'Thunder', why: 'w', whyData: {lev: 0.5, threshold: 0.35, base: 0.3, cap: 2, cuesLeft: 0}}});
    await press(r, 'Why this cue?');
    expect(asText(r)).toContain('That was the last of 2 cues tonight.');
    const ticks = r.root.findAll(n => typeof n.type === 'string' && Array.isArray(n.props.style) && n.props.style[0]?.backgroundColor === color.text && n.props.style[0]?.position === 'absolute' && n.props.style[0]?.width === space(7));
    expect(ticks.map(n => n.props.style[1].left)).toEqual([space((0.35 / 0.6) * 900)]);
  });

  it('Not now sends dismiss and returns home', async () => {
    const fb = jest.spyOn(api, 'sendFeedback').mockResolvedValue();
    const r = await show({...baseState, active: {id: 8, gameId: 'g1', title: 't', body: 'x', home: 'Spurs', away: 'Thunder'}});
    await press(r, 'Not now');
    expect(fb).toHaveBeenCalledWith(8, 'dismiss');
    expect(asText(r)).toContain('CLUTCH');
  });

  describe('states', () => {
    it('loading: before the first answer', async () => {
      jest.spyOn(api, 'getState').mockReturnValue(new Promise(() => undefined));
      const r = await mount(<App />);
      mounted = r;
      expect(asText(r)).toContain('Connecting to Clutch');
      expect(asText(r)).not.toContain('No data');
    });

    it('connection lost: banner names the host and the attempt, and keeps the last known games', async () => {
      jest.useFakeTimers();
      const get = jest.spyOn(api, 'getState').mockResolvedValueOnce(baseState).mockRejectedValue(new Error('network'));
      const r = await mount(<App />);
      mounted = r;
      await ReactTestRenderer.act(async () => {
        jest.advanceTimersByTime(3100);
      });
      jest.useRealTimers();
      await flush();
      expect(get).toHaveBeenCalledTimes(2);
      expect(asText(r)).toContain('Connection lost');
      expect(asText(r)).toContain('10.0.2.2:38787');
      expect(asText(r)).toContain('attempt 1');
      expect(asText(r)).toContain('Thunder at Spurs');
    });

    it('never reached: the first failures show Connection lost, not an empty list', async () => {
      const r = await show(new Error('network'));
      expect(asText(r)).toContain('Connection lost');
      expect(asText(r)).not.toContain('Pick the teams');
    });

    it('stale feed: banner with minutes since the last update', async () => {
      const r = await show({...baseState, feed: {ok: false, ageMs: 130000}});
      expect(asText(r)).toContain('The game feed is behind');
      expect(asText(r)).toContain('2 min');
    });

    it('a fresh feed shows no banner', async () => {
      const r = await show(baseState);
      expect(asText(r)).not.toContain('The game feed is behind');
      expect(asText(r)).not.toContain('Connection lost');
    });

    it('no games tonight: says so, names the next tip-off', async () => {
      const startsAt = new Date(2026, 9, 21, 19, 30).toISOString();
      const r = await show({...baseState, games: [], upcoming: [{label: 'Thunder at Spurs', startsAt}]});
      expect(asText(r)).toContain('No live games right now');
      expect(asText(r)).toContain('Next up: Thunder at Spurs at 7:30 PM');
    });

    it('followed teams are not playing but others are: lists the others as not followed', async () => {
      const r = await show({...baseState, games: [game({id: 'g2', label: 'Celtics at Pistons', followed: false})]});
      expect(asText(r)).toContain('Your teams are not playing right now');
      expect(asText(r)).toContain('Other games, not followed');
      expect(asText(r)).toContain('Celtics at Pistons');
    });

    it('quiet tonight: moon panel explains why, header says back tomorrow', async () => {
      const r = await show({...baseState, tonight: {cues: 2, cap: 2, quiet: true}});
      expect(asText(r)).toContain('Quiet tonight. Back tomorrow.');
      expect(asText(r)).toContain('You passed on three cues within an hour');
    });
  });

  describe('learning bar', () => {
    it('shows the bar now, where it started, and how each cue tonight was answered', async () => {
      const learning = {
        ...baseState.learning,
        threshold: 0.4,
        cues: [
          {cueId: 1, team: 'SA', lev: 0.38, threshold: 0.3, action: 'dismiss' as const, after: 0.35, period: 4, clock: 252},
          {cueId: 2, team: 'SA', lev: 0.52, threshold: 0.35, action: 'accept' as const, after: 0.32, period: 4, clock: 100},
          {cueId: 3, team: 'SA', lev: 0.61, threshold: 0.32, action: null, after: null, period: 5, clock: 200},
        ],
      };
      const r = await show({...baseState, learning});
      const t = asText(r);
      expect(t).toContain('Bar 40');
      expect(t).toContain('Started at 30');
      expect(t).toContain('4th 4:12, Not now, bar 30 to 35');
      expect(t).toContain('4th 1:40, Watched, bar 35 to 32');
      expect(t).toContain('OT 3:20, Waiting, fired at 61');
    });

    it('puts the bar tick at the learned threshold on a 0 to 60 scale and the start tick at the base', async () => {
      const r = await show({...baseState, learning: {...baseState.learning, base: 0.3, threshold: 0.45, cues: []}});
      const lefts = r.root
        .findAll(n => typeof n.type === 'string' && Array.isArray(n.props.style) && n.props.style[0]?.position === 'absolute' && n.props.style[0]?.backgroundColor === color.amber)
        .map(n => n.props.style[1].left);
      expect(lefts).toEqual([space((0.45 / 0.6) * 760)]);
      const grey = r.root.findAll(n => typeof n.type === 'string' && Array.isArray(n.props.style) && n.props.style[0]?.position === 'absolute' && n.props.style[0]?.backgroundColor === color.muted);
      expect(grey.map(n => n.props.style[1].left)).toEqual([space((0.3 / 0.6) * 760)]);
    });

    it('says what a quiet start means when no cue has fired', async () => {
      const r = await show({...baseState, learning: {...baseState.learning, threshold: 0.3, cues: []}});
      expect(asText(r)).toContain('No cues yet tonight');
    });
  });

  describe('D-pad focus: every screen has controls and exactly one first-focus target', () => {
    it('home with games', async () => {
      const c = controls(await show(baseState));
      expect(c.labels).toEqual(expect.arrayContaining(['Thunder at Spurs', 'Teams (1)', 'Pause tonight', 'Two rules', 'Settings']));
      expect(c.preferred).toEqual(['Thunder at Spurs']);
    });
    it('home for an opted-in household that follows nobody', async () => {
      const c = controls(await show({...baseState, follow: [], games: []}));
      expect(c.labels).toEqual(expect.arrayContaining(['Choose teams', 'Teams', 'Two rules', 'Settings']));
      expect(c.preferred).toEqual(['Choose teams']);
    });
    it('home when nothing is live', async () => {
      const c = controls(await show({...baseState, games: []}));
      expect(c.preferred).toEqual(['Teams (1)']);
    });
    it('picker (setup step 1)', async () => {
      const c = controls(await show({...baseState, follow: [], settings: notOnboarded, games: []}));
      expect(c.labels).toEqual(expect.arrayContaining(['Knicks', 'Spurs', 'Celtics', 'Next', 'Back']));
      expect(c.preferred).toEqual(['Knicks']);
    });
    it('quiet hours (setup step 2) and Turn cues on (step 3)', async () => {
      jest.spyOn(api, 'setFollow').mockResolvedValue([]);
      const r = await show({...baseState, follow: [], settings: notOnboarded, games: []});
      await press(r, 'Next');
      await flush();
      const q = controls(r);
      expect(q.labels).toEqual(['No quiet hours', '10 pm to 7 am', '11 pm to 6 am', 'Midnight to 8 am', 'Next', 'Back']);
      expect(q.preferred).toEqual(['No quiet hours']);
      await press(r, 'Next');
      const t = controls(r);
      expect(t.labels).toEqual(['Turn cues on', 'Back']);
      expect(t.preferred).toEqual(['Turn cues on']);
    });
    it('settings', async () => {
      const r = await show(baseState);
      await press(r, 'Settings');
      const c = controls(r);
      expect(c.labels).toEqual(['Turn cues off', 'Pause tonight', 'None', 'Teams (1)', 'Server address', 'Back']);
      expect(c.preferred).toEqual(['Turn cues off']);
    });
    it('same game, two rules', async () => {
      jest.spyOn(api, 'getShowcase').mockResolvedValue(showcase);
      const r = await show(baseState);
      await press(r, 'Two rules');
      await flush();
      const c = controls(r);
      expect(c.labels).toEqual(expect.arrayContaining(['Back']));
      expect(c.labels.length).toBe(1 + showcase.rule.length + showcase.clutch.length);
      expect(c.preferred).toEqual(['Back']);
    });
    it('cue card', async () => {
      const c = controls(await show({...baseState, active: {id: 3, gameId: 'g1', title: 't', body: 'x'}}));
      expect(c.labels).toEqual(['Watch', 'Not now', 'Why this cue?']);
      expect(c.preferred).toEqual(['Watch']);
    });
    it('server settings', async () => {
      const r = await show(baseState);
      await press(r, 'Settings');
      await press(r, 'Server address');
      const c = controls(r);
      expect(c.labels).toEqual(['Save and reconnect', 'Use default', 'Back']);
      expect(c.preferred).toEqual(['Save and reconnect']);
      expect(r.root.findByProps({accessibilityLabel: 'Server address'}).props.value).toBe('http://10.0.2.2:38787');
    });
    it('game view', async () => {
      const r = await show(baseState);
      await press(r, 'Thunder at Spurs');
      expect(controls(r).preferred).toEqual(['Back']);
    });
  });

  it('server settings rejects an address that is not http(s) host and saves a good one', async () => {
    const r = await show(baseState);
    await press(r, 'Settings');
    await press(r, 'Server address');
    const input = () => r.root.findByProps({accessibilityLabel: 'Server address'});
    await ReactTestRenderer.act(async () => input().props.onChangeText('not a url'));
    await press(r, 'Save and reconnect');
    expect(asText(r)).toContain('That is not a server address');
    await ReactTestRenderer.act(async () => input().props.onChangeText('https://clutch.example.com'));
    await press(r, 'Save and reconnect');
    await flush();
    expect(asText(r)).toContain('CLUTCH');
    expect(asText(r)).not.toContain('Where Clutch listens');
  });

  describe('household switches', () => {
    it('cues off: the home says so and offers the way back', async () => {
      const r = await show({...baseState, settings: {...baseState.settings, enabled: false, silence: 'off'}});
      expect(asText(r)).toContain('Cues are off');
      expect(asText(r)).toContain('No toast from any game');
      expect(asText(r)).not.toContain('Your bar tonight');
    });

    it('paused tonight: the footer button becomes Resume and one press calls the pause endpoint', async () => {
      const pause = jest.spyOn(api, 'setPause').mockResolvedValue({...baseState.settings, paused: true, silence: 'paused'});
      const r = await show(baseState);
      await press(r, 'Pause tonight');
      expect(pause).toHaveBeenCalledWith(true);
      const r2 = await show({...baseState, settings: {...baseState.settings, paused: true, silence: 'paused'}});
      expect(asText(r2)).toContain('Paused for tonight');
      expect(controls(r2).labels).toContain('Resume tonight');
      await press(r2, 'Resume tonight');
      expect(pause).toHaveBeenLastCalledWith(false);
    });

    it('settings with cues off offers Turn cues on and says why nothing arrives', async () => {
      const set = jest.spyOn(api, 'setSettings').mockResolvedValue(baseState.settings);
      const r = await show({...baseState, settings: {...baseState.settings, enabled: false, silence: 'off'}});
      await press(r, 'Settings');
      expect(asText(r)).toContain('Off. No toast, from any game, until you turn it back on.');
      await press(r, 'Turn cues on');
      expect(set).toHaveBeenCalledWith({enabled: true});
    });

    it('quiet hours: the home names the hours', async () => {
      const r = await show({...baseState, settings: {...baseState.settings, quiet: {from: 22, to: 7}, silence: 'quiet_hours'}});
      expect(asText(r)).toContain('Quiet hours, 10 pm to 7 am');
      expect(asText(r)).toContain('No cue during 10 pm to 7 am');
    });

    it('settings: the off switch, quiet hours and pause each call the server', async () => {
      const set = jest.spyOn(api, 'setSettings').mockResolvedValue(baseState.settings);
      const pause = jest.spyOn(api, 'setPause').mockResolvedValue(baseState.settings);
      const r = await show(baseState);
      await press(r, 'Settings');
      await press(r, 'Turn cues off');
      expect(set).toHaveBeenCalledWith({enabled: false});
      await press(r, 'Pause tonight');
      expect(pause).toHaveBeenCalledWith(true);
      await press(r, 'None');
      await press(r, 'Midnight to 8 am');
      await press(r, 'Save');
      await flush();
      expect(set).toHaveBeenLastCalledWith({quiet: {from: 0, to: 8}, offsetMin: -new Date().getTimezoneOffset()});
      expect(asText(r)).toContain('Your cues, your rules');
    });
  });

  describe('after the game', () => {
    it('a finished game says what Clutch did: cues, answers, bar movement', async () => {
      const summaries = [{gameId: 'g9', label: 'Thunder at Spurs', cues: 2, accepted: 1, dismissed: 1, waiting: 0, from: 0.3, to: 0.32}];
      const r = await show({...baseState, summaries});
      expect(asText(r)).toContain('Final, Thunder at Spurs');
      expect(asText(r)).toContain('Clutch sent 2 cues: 1 watched, 1 not now. Bar 30 to 32.');
    });

    it('a quiet game is reported as Clutch staying quiet', async () => {
      const r = await show({...baseState, summaries: [{gameId: 'g9', label: 'Thunder at Spurs', cues: 0, accepted: 0, dismissed: 0, waiting: 0, from: 0.3, to: 0.3}]});
      expect(asText(r)).toContain('Clutch stayed quiet. Nothing crossed your bar.');
    });
  });

  describe('same game, two rules', () => {
    it('lists every alert of both rules in game order with a short reason, and the full reason follows focus', async () => {
      jest.spyOn(api, 'getShowcase').mockResolvedValue(showcase);
      const r = await show(baseState);
      await press(r, 'Two rules');
      await flush();
      const t = asText(r);
      expect(t).toContain('Bucks at Hawks');
      expect(t).toContain(showcase.summary);
      const at = t.split('\n').filter(l => /^4th \d:\d\d$/.test(l) && l !== '4th 6:00'); // the first axis tick is not an alert
      expect(at).toEqual(['4th 4:02', '4th 3:17', '4th 2:27']);
      expect(t).toContain('Simple rule alerts. Clutch waits: 18 points at stake, bar 30.');
      expect(t).toContain('Clutch cues: 48 points on the next possession, over the bar of 30.');
      expect(t).toContain('Move through the alerts');
      await ReactTestRenderer.act(async () => {
        r.root.findByProps({accessibilityLabel: '4th 4:02 Simple rule alerts. Clutch waits: 18 points at stake, bar 30.'}).props.onFocus();
      });
      expect(asText(r)).toContain(showcase.rule[0].why);
    });

    it('draws a column per slice of the game, bright only where the pressure is over the bar', async () => {
      jest.spyOn(api, 'getShowcase').mockResolvedValue(showcase);
      const r = await show(baseState);
      await press(r, 'Two rules');
      await flush();
      const cols = r.root.findAll(n => typeof n.type === 'string' && Array.isArray(n.props.style) && n.props.style.length === 3 && n.props.style[0]?.position === 'absolute' && n.props.style[0]?.bottom === 0);
      expect(cols.length).toBe(96);
      expect(cols.filter(n => n.props.style[2].backgroundColor === color.amber).length).toBe(5);
      const heights = cols.map(n => n.props.style[1].height);
      expect(Math.max(...heights.slice(91))).toBeGreaterThan(Math.max(...heights.slice(0, 91)));
    });

    it('a replay that cannot load offers Try again', async () => {
      const get = jest.spyOn(api, 'getShowcase').mockRejectedValueOnce(new Error('down')).mockResolvedValue(showcase);
      const r = await show(baseState);
      await press(r, 'Two rules');
      await flush();
      expect(asText(r)).toContain('The replay did not load');
      await press(r, 'Try again');
      await flush();
      expect(get).toHaveBeenCalledTimes(2);
      expect(asText(r)).toContain('Bucks at Hawks');
    });
  });
});
