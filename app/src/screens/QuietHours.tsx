import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {Button} from '../ui/Button';
import {Quiet} from '../api';
import {QUIET_PRESETS, sameQuiet} from '../quiet';
import {color, type, space} from '../theme';
import {base} from './styles';

interface Props {
  step?: string;
  value: Quiet | null;
  onChange: (q: Quiet | null) => void;
  nextLabel: string;
  onNext: () => void;
  onBack: () => void;
}

/** Hours when Close One never interrupts, in the household's own time. */
export const QuietHours = ({step, value, onChange, nextLabel, onNext, onBack}: Props) => (
  <View style={base.screen}>
    <Text style={base.kicker}>{step ?? 'QUIET HOURS'}</Text>
    <Text style={styles.title}>When should Close One stay out of it?</Text>
    <Text style={base.sub}>No cue is sent during quiet hours, whatever the score.</Text>
    <View style={styles.grid}>
      {QUIET_PRESETS.map(p => (
        <View key={p.label} style={styles.cell}>
          <Button fill preferred={sameQuiet(value, p.quiet)} selected={sameQuiet(value, p.quiet)} label={p.label} onPress={() => onChange(p.quiet)} />
        </View>
      ))}
    </View>
    <View style={base.actions}>
      <Button primary label={nextLabel} onPress={onNext} />
      <View style={base.gap} />
      <Button label="Back" onPress={onBack} />
    </View>
  </View>
);

const styles = StyleSheet.create({
  title: {color: color.text, fontSize: type.title, fontWeight: '800', marginTop: space(8)},
  grid: {flexDirection: 'row', flexWrap: 'wrap', marginTop: space(40), width: space(1200)},
  cell: {width: space(570), marginRight: space(24), marginBottom: space(24)},
});
