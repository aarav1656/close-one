import 'react-native';
import * as React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {App} from '../src/App';

const text = (r: ReactTestRenderer.ReactTestRenderer) =>
  JSON.stringify(r.toJSON());

describe('Clutch base app focus', () => {
  it('moves the header text with tile focus', async () => {
    let r!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      r = ReactTestRenderer.create(<App />);
    });
    expect(text(r)).toContain('Base app running');
    expect(text(r)).not.toContain('Background service and toast spike controls.');
    const tile = r.root.findByProps({id: 'service', label: 'Service'});
    await ReactTestRenderer.act(async () => {
      tile.props.onFocus('service');
    });
    expect(text(r)).toContain('Background service and toast spike controls.');
    expect(text(r)).not.toContain('Base app running');
  });
});
