import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {Alert, Showcase} from '../api';
import {color, type, space} from '../theme';

const W = 1500;
const H = 175;
const LEV_TOP = 0.6;
const LABEL_W = 190;
const pts = (x: number) => Math.round(x * 100);

const Mark = ({kind, active}: {kind: 'rule' | 'clutch'; active: boolean}) => (
  <View style={[styles.mark, kind === 'rule' ? styles.rule : styles.clutch, active && styles.active]} />
);

/**
 * One finished game on its own clock: the pressure on every possession as columns (bright over the bar),
 * the bar as a line, then a lane per rule with a mark at every alert it would have sent.
 * `selected` is the alert the household's focus is on.
 */
export const Timeline = ({data, selected}: {data: Showcase; selected: {kind: 'rule' | 'clutch'; index: number} | null}) => {
  const x = (t: number) => ((t - data.from) / (data.total - data.from)) * W;
  const col = W / data.series.length;
  return (
    <View accessibilityLabel={`${data.label}: ${data.rule.length} simple alerts, ${data.clutch.length} Clutch cues`}>
      <View style={styles.chartRow}>
        <View style={styles.yAxis}>
          <Text style={styles.axisText}>Pressure</Text>
        </View>
        <View style={styles.chart}>
          {data.series.map((lev, i) => {
            const h = Math.max(space(4), (Math.min(lev, LEV_TOP) / LEV_TOP) * space(H));
            return <View key={i} style={[styles.col, {left: space(i * col), width: space(col - 3), height: h}, lev >= data.bar ? styles.over : styles.under]} />;
          })}
          <View style={[styles.barLine, {bottom: space((data.bar / LEV_TOP) * H)}]} />
          <Text style={[styles.barText, {bottom: space((data.bar / LEV_TOP) * H) + space(6)}]}>Bar {pts(data.bar)}</Text>
        </View>
      </View>
      <View style={styles.quarters}>
        {data.ticks.map((tk, i) => (
          <Text key={tk.t} style={[styles.qText, {left: space(LABEL_W + x(tk.t)) - (i === 0 ? 0 : space(20))}]}>
            {tk.label}
          </Text>
        ))}
      </View>
      {(['rule', 'clutch'] as const).map(kind => (
        <View key={kind} style={styles.lane}>
          <Text style={styles.laneLabel}>{kind === 'rule' ? 'Simple rule' : 'Clutch'}</Text>
          <View style={styles.laneTrack}>
            {(kind === 'rule' ? data.rule : data.clutch).map((a: Alert, i) => (
              <View key={a.t} style={[styles.markWrap, {left: space(x(a.t) - 17)}]}>
                <Mark kind={kind} active={selected?.kind === kind && selected.index === i} />
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  chartRow: {flexDirection: 'row'},
  yAxis: {width: space(LABEL_W), justifyContent: 'flex-end', paddingBottom: space(4)},
  axisText: {color: color.muted, fontSize: type.label},
  chart: {width: space(W), height: space(H), borderBottomWidth: space(3), borderBottomColor: color.line},
  col: {position: 'absolute', bottom: 0, borderTopLeftRadius: space(3), borderTopRightRadius: space(3)},
  under: {backgroundColor: color.line},
  over: {backgroundColor: color.amber},
  barLine: {position: 'absolute', left: 0, right: 0, height: space(3), backgroundColor: color.muted},
  barText: {position: 'absolute', left: space(8), color: color.muted, fontSize: type.label},
  quarters: {height: space(40), marginLeft: 0},
  qText: {position: 'absolute', top: space(6), color: color.muted, fontSize: type.label},
  lane: {flexDirection: 'row', alignItems: 'center', height: space(50)},
  laneLabel: {width: space(LABEL_W), color: color.text, fontSize: type.label, fontWeight: '700'},
  laneTrack: {width: space(W), height: space(50), borderTopWidth: space(2), borderTopColor: color.line},
  markWrap: {position: 'absolute', top: space(8)},
  mark: {width: space(34), height: space(34), borderRadius: space(17)},
  rule: {borderWidth: space(5), borderColor: color.muted},
  clutch: {backgroundColor: color.amber, borderWidth: space(5), borderColor: color.amber},
  active: {borderColor: color.text, transform: [{scale: 1.3}]},
});
