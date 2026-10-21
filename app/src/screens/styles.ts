import {StyleSheet} from 'react-native';
import {color, type, space} from '../theme';

export const base = StyleSheet.create({
  screen: {flex: 1, backgroundColor: color.canvas, paddingHorizontal: space(120), paddingTop: space(72)},
  brand: {color: color.amber, fontSize: type.title, fontWeight: '800', letterSpacing: 8},
  kicker: {color: color.amber, fontSize: type.label, fontWeight: '700', letterSpacing: 6},
  hero: {color: color.text, fontSize: type.hero, fontWeight: '800', marginTop: space(12)},
  title: {color: color.text, fontSize: type.title, fontWeight: '800'},
  sub: {color: color.muted, fontSize: type.body, marginTop: space(16)},
  label: {color: color.muted, fontSize: type.label, marginBottom: space(16)},
  detail: {color: color.muted, fontSize: type.label, marginTop: space(10)},
  actions: {flexDirection: 'row', marginTop: space(64)},
  gap: {width: space(40)},
});
