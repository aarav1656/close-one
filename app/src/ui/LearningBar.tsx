import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {CueMark, ServerState, periodLabel, clockLabel} from '../api';
import {color, type, space} from '../theme';

const WIDTH = 760;
const pts = (x: number) => Math.round(x * 100);
const answerWord = (a: CueMark['action']) => (a === 'accept' ? 'Watched' : a === 'dismiss' ? 'Not now' : 'Waiting');

const Mark = ({action}: {action: CueMark['action']}) => (
  <View
    style={[
      styles.mark,
      action === 'accept' && styles.accept,
      action === 'dismiss' && styles.dismiss,
      action === null && styles.waiting,
    ]}
  />
);

/**
 * The household's bar for tonight on a 0 to max scale of win chance a possession can swing: where the bar
 * sits now, where it started, and every cue sent tonight at the leverage it fired at, shaped by how it was answered.
 */
export const LearningBar = ({learning}: {learning: ServerState['learning']}) => {
  const x = (v: number) => (Math.min(v, learning.max) / learning.max) * WIDTH;
  const moved = pts(learning.threshold) !== pts(learning.base);
  return (
    <View accessibilityLabel={`Your bar is ${pts(learning.threshold)}. ${learning.cues.length} cues tonight.`}>
      <View style={styles.track}>
        <View style={[styles.cueZone, {left: space(x(learning.threshold)), width: space(WIDTH - x(learning.threshold))}]} />
        {moved ? <View style={[styles.baseTick, {left: space(x(learning.base))}]} /> : null}
        <View style={[styles.barTick, {left: space(x(learning.threshold))}]} />
        {learning.cues.map(c => (
          <View key={c.cueId} style={[styles.markWrap, {left: space(x(c.lev) - 14)}]}>
            <Mark action={c.action} />
          </View>
        ))}
      </View>
      <View style={styles.axis}>
        <Text style={styles.axisText}>0</Text>
        <Text style={[styles.axisText, styles.barLabel, {left: space(x(learning.threshold) - 70)}]}>
          Bar {pts(learning.threshold)}
        </Text>
        <Text style={[styles.axisText, styles.axisEnd]}>{pts(learning.max)}</Text>
      </View>
      {moved ? <Text style={styles.note}>Started at {pts(learning.base)}. It moves with how you answer.</Text> : null}
      {learning.cues.length === 0 ? (
        <Text style={styles.note}>No cues yet tonight. Clutch speaks up when a possession can swing a game past the bar.</Text>
      ) : (
        learning.cues.map(c => (
          <View key={c.cueId} style={styles.line}>
            <Mark action={c.action} />
            <Text style={styles.lineText}>
              {periodLabel(c.period)} {clockLabel(c.clock)}, {answerWord(c.action)}
              {c.after !== null ? `, bar ${pts(c.threshold)} to ${pts(c.after)}` : `, fired at ${pts(c.lev)}`}
            </Text>
          </View>
        ))
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  track: {width: space(WIDTH), height: space(56), backgroundColor: color.line, borderRadius: space(10), marginTop: space(12)},
  cueZone: {position: 'absolute', top: 0, bottom: 0, backgroundColor: color.amberDim, borderTopRightRadius: space(10), borderBottomRightRadius: space(10)},
  barTick: {position: 'absolute', top: -space(10), bottom: -space(10), width: space(8), backgroundColor: color.amber, borderRadius: space(4)},
  baseTick: {position: 'absolute', top: -space(6), bottom: -space(6), width: space(4), backgroundColor: color.muted},
  markWrap: {position: 'absolute', top: space(14)},
  mark: {width: space(28), height: space(28)},
  accept: {backgroundColor: color.go, borderRadius: space(14)},
  dismiss: {backgroundColor: color.stop, transform: [{rotate: '45deg'}], borderRadius: space(3)},
  waiting: {borderWidth: space(4), borderColor: color.text, borderRadius: space(14)},
  axis: {width: space(WIDTH), height: space(48), marginTop: space(14)},
  axisText: {color: color.muted, fontSize: type.label},
  axisEnd: {position: 'absolute', right: 0},
  barLabel: {position: 'absolute', width: space(140), textAlign: 'center', color: color.amber, fontWeight: '800'},
  note: {color: color.muted, fontSize: type.label, marginTop: space(8)},
  line: {flexDirection: 'row', alignItems: 'center', marginTop: space(14)},
  lineText: {color: color.text, fontSize: type.label, marginLeft: space(18)},
});
