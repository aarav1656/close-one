import {Linking} from 'react-native';
import * as React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {App} from '../src/App';
import {CUE_SERVICE_URI} from '../src/config';
import * as api from '../src/api';

const text = (r: ReactTestRenderer.ReactTestRenderer) => JSON.stringify(r.toJSON());
const flush = () => ReactTestRenderer.act(async () => {});

const base: api.ServerState = {
  active: null,
  tonight: {cues: 1, cap: 2, quiet: false},
  games: [{id: 'g1', home: 'Spurs', away: 'Thunder', label: 'Thunder at Spurs', status: 'live', period: 4, clock: 192, pressure: 0.8}],
};

describe('Clutch app', () => {
  beforeEach(() => {
    jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  });

  it('starts the cue service and shows tonight’s budget and live games', async () => {
    jest.spyOn(api, 'getState').mockResolvedValue(base);
    let r!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      r = ReactTestRenderer.create(<App />);
    });
    await flush();
    expect(Linking.openURL).toHaveBeenCalledWith(CUE_SERVICE_URI);
    expect(text(r)).toContain('1 of 2 interruptions left tonight');
    expect(text(r)).toContain('Thunder at Spurs');
    expect(text(r)).toContain('4th 3:12');
  });

  it('puts the card in front for an active cue and sends accept when Watch is pressed, never a score', async () => {
    const card = {id: 7, gameId: 'g1', title: 't', body: '4th quarter, 3:12 left. Press Menu to switch.', home: 'Spurs', away: 'Thunder'};
    jest.spyOn(api, 'getState').mockResolvedValue({...base, active: card});
    const fb = jest.spyOn(api, 'sendFeedback').mockResolvedValue();
    let r!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      r = ReactTestRenderer.create(<App />);
    });
    await flush();
    expect(text(r)).toContain('COMING DOWN TO THE WIRE');
    expect(text(r)).toContain('Thunder');
    expect(text(r)).not.toMatch(/\d+-\d+/);
    await ReactTestRenderer.act(async () => {
      r.root.findByProps({accessibilityLabel: 'Watch'}).props.onPress();
    });
    expect(fb).toHaveBeenCalledWith(7, 'accept');
    expect(text(r)).toContain('Pressure on the next possession');
  });

  it('Not now sends dismiss and returns home', async () => {
    const card = {id: 8, gameId: 'g1', title: 't', body: 'x', home: 'Spurs', away: 'Thunder'};
    jest.spyOn(api, 'getState').mockResolvedValue({...base, active: card});
    const fb = jest.spyOn(api, 'sendFeedback').mockResolvedValue();
    let r!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      r = ReactTestRenderer.create(<App />);
    });
    await flush();
    await ReactTestRenderer.act(async () => {
      r.root.findByProps({accessibilityLabel: 'Not now'}).props.onPress();
    });
    expect(fb).toHaveBeenCalledWith(8, 'dismiss');
    expect(text(r)).toContain('CLUTCH');
  });
});
