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

const teams: api.Team[] = [
  {abbr: 'NY', city: 'New York', nick: 'Knicks', name: 'New York Knicks'},
  {abbr: 'SA', city: 'San Antonio', nick: 'Spurs', name: 'San Antonio Spurs'},
  {abbr: 'BOS', city: 'Boston', nick: 'Celtics', name: 'Boston Celtics'},
];

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

  it('a household that follows nobody lands on the team picker, not on a game', async () => {
    const r = await show({...baseState, follow: [], games: [game({followed: false})]});
    expect(asText(r)).toContain('Pick the teams you follow');
    expect(asText(r)).toContain('Knicks');
    expect(asText(r)).not.toContain('Your teams tonight');
  });

  it('saving the picker sends the chosen abbreviations and returns home', async () => {
    const save = jest.spyOn(api, 'setFollow').mockResolvedValue(['NY', 'BOS']);
    const r = await show({...baseState, follow: [], games: []});
    await press(r, 'Knicks');
    await press(r, 'Celtics');
    expect(asText(r)).toContain('Done, following 2');
    await press(r, 'Done, following 2');
    await flush();
    expect(save).toHaveBeenCalledWith(['NY', 'BOS']);
    expect(asText(r)).toContain('CLUTCH');
    expect(asText(r)).not.toContain('Done, following');
  });

  it('tapping a team twice un-picks it', async () => {
    const save = jest.spyOn(api, 'setFollow').mockResolvedValue([]);
    const r = await show({...baseState, follow: [], games: []});
    await press(r, 'Knicks');
    await press(r, 'Knicks');
    expect(asText(r)).not.toContain('Done, following');
    await press(r, 'Done');
    expect(save).toHaveBeenCalledWith([]);
  });

  it('a picker that cannot save says so and keeps the picks', async () => {
    jest.spyOn(api, 'setFollow').mockRejectedValue(new Error('down'));
    const r = await show({...baseState, follow: [], games: []});
    await press(r, 'Knicks');
    await press(r, 'Done, following 1');
    await flush();
    expect(asText(r)).toContain('Could not save');
    expect(asText(r)).toContain('Done, following 1');
  });

  it('puts the card in front for an active cue, sends accept on Watch, and never shows a score', async () => {
    const card = {id: 7, gameId: 'g1', title: 't', body: '4th quarter, 3:12 left. Press Menu to open Clutch.', home: 'Spurs', away: 'Thunder', why: 'Close, and the next possession can move the win chance by 38 points.'};
    const fb = jest.spyOn(api, 'sendFeedback').mockResolvedValue();
    const r = await show({...baseState, active: card});
    expect(asText(r)).toContain('COMING DOWN TO THE WIRE');
    expect(asText(r)).toContain('Thunder');
    expect(asText(r)).not.toMatch(/\d+-\d+/);
    expect(asText(r)).not.toContain('Press Menu');
    await press(r, 'Watch');
    expect(fb).toHaveBeenCalledWith(7, 'accept');
    expect(asText(r)).toContain('Pressure on the next possession');
  });

  it('Why now? reveals the leverage reason and Hide reason folds it away', async () => {
    const why = 'Close, and the next possession can move the win chance by 38 points.';
    const r = await show({...baseState, active: {id: 9, gameId: 'g1', title: 't', body: 'x', home: 'Spurs', away: 'Thunder', why}});
    expect(asText(r)).not.toContain(why);
    await press(r, 'Why now?');
    expect(asText(r)).toContain(why);
    await press(r, 'Hide reason');
    expect(asText(r)).not.toContain(why);
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
      expect(c.labels).toEqual(expect.arrayContaining(['Thunder at Spurs', 'Teams (1)', 'Server']));
      expect(c.preferred).toEqual(['Thunder at Spurs']);
    });
    it('home with no teams chosen yet, picker dismissed', async () => {
      const r = await show({...baseState, follow: [], games: []});
      await press(r, 'Back');
      const c = controls(r);
      expect(c.labels).toEqual(expect.arrayContaining(['Choose teams', 'Teams', 'Server']));
      expect(c.preferred).toEqual(['Choose teams']);
    });
    it('home when nothing is live', async () => {
      const c = controls(await show({...baseState, games: []}));
      expect(c.preferred).toEqual(['Teams (1)']);
    });
    it('picker', async () => {
      const c = controls(await show({...baseState, follow: [], games: []}));
      expect(c.labels).toEqual(expect.arrayContaining(['Knicks', 'Spurs', 'Celtics', 'Done', 'Back']));
      expect(c.preferred).toEqual(['Knicks']);
    });
    it('cue card', async () => {
      const c = controls(await show({...baseState, active: {id: 3, gameId: 'g1', title: 't', body: 'x'}}));
      expect(c.labels).toEqual(['Watch', 'Not now', 'Why now?']);
      expect(c.preferred).toEqual(['Watch']);
    });
    it('server settings', async () => {
      const r = await show(baseState);
      await press(r, 'Server');
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
    await press(r, 'Server');
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
});
