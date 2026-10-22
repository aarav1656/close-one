import React, {useEffect, useState} from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {Button} from '../ui/Button';
import {Timeline} from '../ui/Timeline';
import {Alert, Showcase as ShowcaseData, getShowcase} from '../api';
import {color, type, space} from '../theme';
import {base} from './styles';

const pts = (x: number) => Math.round(x * 100);

type Pick = {kind: 'rule' | 'clutch'; index: number};

const shortLine = (kind: Pick['kind'], a: Alert, bar: number): string =>
  kind === 'clutch'
    ? `Close One cues: ${pts(a.lev)} points on the next possession, over the bar of ${pts(bar)}.`
    : a.verdict === 'cue'
    ? 'Simple rule alerts. Close One cues too.'
    : `Simple rule alerts. Close One waits: ${pts(a.lev)} points at stake, bar ${pts(bar)}.`;

const Row = ({label, line, onFocus, selected}: {label: string; line: string; onFocus: () => void; selected: boolean}) => {
  const [focused, setFocused] = useState(false);
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`${label} ${line}`}
      onFocus={() => {
        console.log(`CLUTCH_FOCUS ${label}`);
        setFocused(true);
        onFocus();
      }}
      onBlur={() => setFocused(false)}
      onPress={onFocus}
      activeOpacity={0.9}
      style={[styles.row, selected && styles.rowOn, focused && styles.rowFocus]}>
      <Text style={styles.at}>{label}</Text>
      <Text style={styles.line}>{line}</Text>
    </TouchableOpacity>
  );
};

/** Same game, two rules: the timeline, every alert in order, and the full reason for the one in focus. */
export const ShowcaseScreen = ({onBack}: {onBack: () => void}) => {
  const [data, setData] = useState<ShowcaseData | null>(null);
  const [failed, setFailed] = useState(false);
  const [tries, setTries] = useState(0);
  const [pick, setPick] = useState<Pick | null>(null);

  useEffect(() => {
    let live = true;
    setFailed(false);
    getShowcase().then(
      d => live && setData(d),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [tries]);

  if (failed) {
    return (
      <View style={base.screen}>
        <Text style={base.kicker}>SAME GAME, TWO RULES</Text>
        <Text style={base.title}>The replay did not load</Text>
        <Text style={base.detail}>Check the server connection and try again.</Text>
        <View style={base.actions}>
          <Button preferred label="Try again" onPress={() => setTries(n => n + 1)} />
          <View style={base.gap} />
          <Button label="Back" onPress={onBack} />
        </View>
      </View>
    );
  }
  if (!data) {
    return (
      <View style={base.screen}>
        <Text style={base.kicker}>SAME GAME, TWO RULES</Text>
        <Text style={base.title}>Loading the replay</Text>
      </View>
    );
  }
  const events = [
    ...data.rule.map((a, index) => ({kind: 'rule' as const, a, index})),
    ...data.clutch.map((a, index) => ({kind: 'clutch' as const, a, index})),
  ].sort((p, q) => p.a.t - q.a.t);
  const chosen = pick ? events.find(e => e.kind === pick.kind && e.index === pick.index) : undefined;

  return (
    <View style={[base.screen, styles.screen]}>
      <Text style={base.kicker}>SAME GAME, TWO RULES</Text>
      <Text style={styles.title}>{data.label}</Text>
      <Text style={styles.summary}>{data.summary}</Text>
      <View style={styles.chart}>
        <Timeline data={data} selected={pick} />
      </View>
      <View style={styles.list}>
        {events.map((e, i) => (
          <Row
            key={`${e.kind}${e.index}`}
            label={e.a.at}
            line={shortLine(e.kind, e.a, data.bar)}
            selected={pick?.kind === e.kind && pick.index === e.index}
            onFocus={() => setPick({kind: e.kind, index: e.index})}
          />
        ))}
      </View>
      <Text style={styles.why} accessibilityLabel="Reason">
        {chosen ? chosen.a.why : 'Move through the alerts to read the reason for each.'}
      </Text>
      <View style={styles.footer}>
        <Button compact preferred label="Back" onPress={onBack} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {paddingTop: space(32), paddingHorizontal: space(110)},
  title: {color: color.text, fontSize: type.title, fontWeight: '800', marginTop: space(4)},
  summary: {color: color.muted, fontSize: type.label, marginTop: space(6)},
  chart: {marginTop: space(16)},
  list: {marginTop: space(6)},
  row: {flexDirection: 'row', alignItems: 'center', paddingVertical: space(7), paddingHorizontal: space(18), borderRadius: space(10), borderWidth: space(4), borderColor: 'transparent'},
  rowOn: {backgroundColor: color.panel},
  rowFocus: {borderColor: color.text},
  at: {color: color.amber, fontSize: type.label, fontWeight: '800', width: space(190)},
  line: {color: color.text, fontSize: type.label, flex: 1},
  why: {color: color.muted, fontSize: type.label, marginTop: space(8), minHeight: space(84)},
  footer: {flexDirection: 'row', marginTop: space(6)},
});
