import React, {useState} from 'react';
import {View, Text, TextInput, StyleSheet} from 'react-native';
import {Button} from '../ui/Button';
import {normalizeServerUrl} from '../config';
import {color, type, space} from '../theme';
import {base} from './styles';

interface Props {
  current: string;
  defaultUrl: string;
  onSave: (url: string) => Promise<boolean>;
  onReset: () => Promise<void>;
  onBack: () => void;
}

export const ServerSettings = ({current, defaultUrl, onSave, onReset, onBack}: Props) => {
  const [text, setText] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  const save = async () => {
    if (!normalizeServerUrl(text) || !(await onSave(text))) {
      setError('That is not a server address. Use http://host:port or https://host.');
    }
  };

  return (
    <View style={base.screen}>
      <Text style={base.kicker}>SERVER</Text>
      <Text style={base.hero}>Where Close One listens</Text>
      <Text style={base.sub}>The address of the Close One server for your household. Changing it pairs this TV again.</Text>
      <TextInput
        accessibilityLabel="Server address"
        value={text}
        onChangeText={t => {
          setText(t);
          setError(null);
        }}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        onFocus={() => {
          console.log('CLUTCH_FOCUS Server address');
          setFocused(true);
        }}
        onBlur={() => setFocused(false)}
        style={[styles.input, focused && styles.inputFocused]}
      />
      {error ? <Text style={styles.err}>{error}</Text> : <Text style={base.detail}>Built-in default: {defaultUrl}</Text>}
      <View style={base.actions}>
        <Button primary preferred label="Save and reconnect" onPress={save} />
        <View style={base.gap} />
        <Button label="Use default" onPress={onReset} />
        <View style={base.gap} />
        <Button label="Back" onPress={onBack} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  input: {
    marginTop: space(40),
    backgroundColor: color.panel,
    color: color.text,
    fontSize: type.body,
    paddingVertical: space(24),
    paddingHorizontal: space(32),
    borderRadius: space(14),
    borderWidth: space(6),
    borderColor: 'transparent',
    maxWidth: space(1200),
  },
  inputFocused: {borderColor: color.text},
  err: {color: color.stop, fontSize: type.label, marginTop: space(10)},
});
