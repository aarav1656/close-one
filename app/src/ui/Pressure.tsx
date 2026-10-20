import React from 'react';
import {View, StyleSheet} from 'react-native';
import {color, space} from '../theme';

const SEGMENTS = 12;

/** How much is riding on the next possession, 0 to 1, as a row of lit segments. */
export const Pressure = ({value}: {value: number}) => {
  const lit = Math.round(Math.max(0, Math.min(1, value)) * SEGMENTS);
  return (
    <View style={styles.row} accessibilityLabel={`Pressure ${lit} of ${SEGMENTS}`}>
      {Array.from({length: SEGMENTS}, (_, i) => (
        <View key={i} style={[styles.seg, i < lit ? styles.on : styles.off]} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'flex-end'},
  seg: {width: space(34), marginRight: space(10), borderRadius: space(4)},
  on: {backgroundColor: color.amber, height: space(56)},
  off: {backgroundColor: color.line, height: space(24)},
});
