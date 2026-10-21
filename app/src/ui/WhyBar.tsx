import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {color, type, space} from '../theme';

const W = 900;
const TOP = 0.6;
const pts = (x: number) => Math.round(x * 100);

/** The cue's pressure against the household's bar on one 0 to 60 scale, with what is left of tonight's budget. */
export const WhyBar = ({lev, threshold, cuesLeft, cap}: {lev: number; threshold: number; cuesLeft: number; cap: number}) => {
  const x = (v: number) => (Math.min(v, TOP) / TOP) * W;
  return (
    <View accessibilityLabel={`Pressure ${pts(lev)} against your bar of ${pts(threshold)}`}>
      <View style={styles.track}>
        <View style={[styles.over, {left: space(x(threshold)), width: space(W - x(threshold))}]} />
        <View style={[styles.barTick, {left: space(x(threshold))}]} />
        <View style={[styles.level, {width: space(x(lev))}]} />
      </View>
      <View style={styles.labels}>
        <Text style={styles.figure}>Pressure {pts(lev)}</Text>
        <Text style={styles.figure}>Your bar {pts(threshold)}</Text>
      </View>
      <Text style={styles.left}>
        {cuesLeft > 0 ? `${cuesLeft} of ${cap} cues left tonight after this one.` : `That was the last of ${cap} cues tonight.`}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  track: {width: space(W), height: space(34), backgroundColor: color.line, borderRadius: space(8), marginTop: space(10)},
  over: {position: 'absolute', top: 0, bottom: 0, backgroundColor: color.amberDim, borderTopRightRadius: space(8), borderBottomRightRadius: space(8)},
  level: {position: 'absolute', left: 0, top: space(8), bottom: space(8), backgroundColor: color.amber, borderRadius: space(4)},
  barTick: {position: 'absolute', top: -space(8), bottom: -space(8), width: space(7), backgroundColor: color.text, borderRadius: space(3)},
  labels: {flexDirection: 'row', justifyContent: 'space-between', width: space(W), marginTop: space(8)},
  figure: {color: color.text, fontSize: type.label, fontWeight: '700'},
  left: {color: color.muted, fontSize: type.label, marginTop: space(8)},
});
