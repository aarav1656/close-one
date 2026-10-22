import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {Button} from '../ui/Button';
import {Quiet} from '../api';
import {quietLabel} from '../quiet';
import {color, type, space} from '../theme';
import {base} from './styles';

interface Props {
  teams: string[];
  quiet: Quiet | null;
  saving: boolean;
  failed: boolean;
  onTurnOn: () => void;
  onBack: () => void;
}

const Fact = ({k, v}: {k: string; v: string}) => (
  <View style={styles.fact}>
    <Text style={styles.k}>{k}</Text>
    <Text style={styles.v}>{v}</Text>
  </View>
);

/** The opt-in: nothing is sent until the household presses the button on this screen. */
export const TurnOn = ({teams, quiet, saving, failed, onTurnOn, onBack}: Props) => (
  <View style={base.screen}>
    <Text style={base.kicker}>STEP 3 OF 3</Text>
    <Text style={base.hero}>Turn cues on</Text>
    <Text style={base.sub}>Until you do, Close One sends nothing.</Text>
    <View style={styles.facts}>
      <Fact k="Your teams" v={teams.length ? teams.join(', ') : 'None picked yet'} />
      <Fact k="Quiet hours" v={quietLabel(quiet)} />
      <Fact k="Most interruptions in a night" v="2" />
      <Fact k="The toast shows" v="Which game, which quarter. Never the score." />
    </View>
    <View style={base.actions}>
      <Button primary preferred label={saving ? 'Turning on' : 'Turn cues on'} onPress={saving ? () => undefined : onTurnOn} />
      <View style={base.gap} />
      <Button label="Back" onPress={onBack} />
    </View>
    {failed ? <Text style={styles.err}>Could not reach the server. Check the connection and try again.</Text> : null}
  </View>
);

const styles = StyleSheet.create({
  facts: {marginTop: space(36), maxWidth: space(1200)},
  fact: {flexDirection: 'row', paddingVertical: space(14), borderBottomWidth: space(2), borderBottomColor: color.line},
  k: {color: color.muted, fontSize: type.label, width: space(520)},
  v: {color: color.text, fontSize: type.body, fontWeight: '700', flex: 1},
  err: {color: color.stop, fontSize: type.label, marginTop: space(24)},
});
