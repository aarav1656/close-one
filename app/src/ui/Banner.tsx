import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {color, type, space} from '../theme';

/** A full width notice. tone "bad" is for a lost link, "warn" for data that may be old. */
export const Banner = ({tone, title, detail}: {tone: 'bad' | 'warn'; title: string; detail: string}) => (
  <View
    accessibilityRole="alert"
    accessibilityLabel={`${title}. ${detail}`}
    style={[styles.box, {borderLeftColor: tone === 'bad' ? color.stop : color.amber}]}>
    <Text style={styles.title}>{title}</Text>
    <Text style={styles.detail}>{detail}</Text>
  </View>
);

const styles = StyleSheet.create({
  box: {
    backgroundColor: color.panel,
    borderLeftWidth: space(10),
    paddingVertical: space(18),
    paddingHorizontal: space(32),
    marginTop: space(28),
    borderRadius: space(10),
  },
  title: {color: color.text, fontSize: type.body, fontWeight: '800'},
  detail: {color: color.muted, fontSize: type.label, marginTop: space(6)},
});
