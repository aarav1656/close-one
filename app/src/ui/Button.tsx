import React, {useState} from 'react';
import {Text, TouchableOpacity, StyleSheet} from 'react-native';
import {color, type, space} from '../theme';

interface Props {
  label: string;
  onPress: () => void;
  primary?: boolean;
  preferred?: boolean;
  testID?: string;
}

export const Button = ({label, onPress, primary, preferred, testID}: Props) => {
  const [focused, setFocused] = useState(false);
  return (
    <TouchableOpacity
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      hasTVPreferredFocus={preferred}
      onFocus={() => {
        console.log(`CLUTCH_FOCUS ${label}`);
        setFocused(true);
      }}
      onBlur={() => setFocused(false)}
      onPress={onPress}
      activeOpacity={0.9}
      style={[
        styles.base,
        primary ? styles.primary : styles.secondary,
        focused && styles.focused,
      ]}>
      <Text style={[styles.text, primary && styles.primaryText]}>{label}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    minWidth: space(420),
    paddingVertical: space(28),
    paddingHorizontal: space(48),
    borderRadius: space(16),
    borderWidth: space(6),
    borderColor: 'transparent',
    alignItems: 'center',
  },
  primary: {backgroundColor: color.amber},
  secondary: {backgroundColor: color.panel},
  focused: {borderColor: color.text, transform: [{scale: 1.06}]},
  text: {color: color.text, fontSize: type.body, fontWeight: '700'},
  primaryText: {color: color.canvas},
});
