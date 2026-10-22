import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {Button} from '../ui/Button';
import {Settings as SettingsData} from '../api';
import {quietLabel} from '../quiet';
import {color, type, space} from '../theme';
import {base} from './styles';

interface Props {
  settings: SettingsData;
  teamCount: number;
  teamNames: string[];
  onToggleCues: () => void;
  onTogglePause: () => void;
  onQuiet: () => void;
  onTeams: () => void;
  onServer: () => void;
  onBack: () => void;
}

const Row = ({title, note, children}: {title: string; note: string; children: React.ReactNode}) => (
  <View style={styles.row}>
    <View style={styles.words}>
      <Text style={styles.rowTitle}>{title}</Text>
      <Text style={styles.rowNote}>{note}</Text>
    </View>
    <View style={styles.action}>{children}</View>
  </View>
);

/** Every switch the household owns, one press each. The off switch is the first row. */
export const Settings = ({settings, teamCount, teamNames, onToggleCues, onTogglePause, onQuiet, onTeams, onServer, onBack}: Props) => (
  <View style={base.screen}>
    <Text style={base.kicker}>SETTINGS</Text>
    <Text style={styles.title}>Your cues, your rules</Text>
    <View style={styles.list}>
      <Row title="Cues" note={settings.enabled ? 'Close One may interrupt for the games you follow.' : 'Off. No toast, from any game, until you turn it back on.'}>
        <Button fill preferred compact label={settings.enabled ? 'Turn cues off' : 'Turn cues on'} onPress={onToggleCues} />
      </Row>
      <Row title="Tonight" note={settings.paused ? 'Paused. Cues come back tomorrow, or when you resume.' : 'One press silences every cue until tomorrow.'}>
        <Button fill compact label={settings.paused ? 'Resume tonight' : 'Pause tonight'} onPress={onTogglePause} />
      </Row>
      <Row title="Quiet hours" note="Never interrupts in these hours.">
        <Button fill compact label={quietLabel(settings.quiet)} onPress={onQuiet} />
      </Row>
      <Row title="Teams" note={teamNames.length ? `${teamNames.join(', ')}. Only games with these teams in them can cue you.` : 'Only games with these teams in them can cue you.'}>
        <Button fill compact label={`Teams (${teamCount})`} onPress={onTeams} />
      </Row>
      <Row title="Server" note="The address your TV pairs with.">
        <Button fill compact label="Server address" onPress={onServer} />
      </Row>
    </View>
    <View style={styles.footer}>
      <Button fill compact label="Back" onPress={onBack} />
    </View>
  </View>
);

const styles = StyleSheet.create({
  title: {color: color.text, fontSize: type.title, fontWeight: '800', marginTop: space(6)},
  list: {marginTop: space(28)},
  row: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: space(14), borderBottomWidth: space(2), borderBottomColor: color.line},
  words: {flex: 1, paddingRight: space(40)},
  action: {width: space(360)},
  rowTitle: {color: color.text, fontSize: type.body, fontWeight: '700'},
  rowNote: {color: color.muted, fontSize: type.label, marginTop: space(4)},
  footer: {flexDirection: 'row', marginTop: space(28)},
});
