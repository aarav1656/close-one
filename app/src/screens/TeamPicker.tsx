import React, {useEffect, useState} from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {Button} from '../ui/Button';
import {Team, getTeams} from '../api';
import {color, type, space} from '../theme';
import {base} from './styles';

interface Props {
  /** Shown above the title during onboarding, for example STEP 1 OF 3. */
  step?: string;
  /** Label of the save button when teams are picked. */
  doneLabel?: string;
  initial: string[];
  onSave: (abbrs: string[]) => Promise<void>;
  onBack: () => void;
}

export const TeamPicker = ({step, doneLabel, initial, onSave, onBack}: Props) => {
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [tries, setTries] = useState(0);
  const [picked, setPicked] = useState<string[]>(initial);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setFailed(false);
    getTeams().then(
      t => live && setTeams(t),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [tries]);

  const toggle = (abbr: string) => setPicked(p => (p.includes(abbr) ? p.filter(a => a !== abbr) : [...p, abbr]));
  const save = async () => {
    setSaving(true);
    setSaveFailed(false);
    try {
      await onSave(picked);
    } catch {
      setSaveFailed(true);
      setSaving(false);
    }
  };

  return (
    <View style={[base.screen, styles.screen]}>
      <Text style={base.kicker}>{step ?? 'YOUR TEAMS'}</Text>
      <Text style={styles.title}>Pick the teams you follow</Text>
      <Text style={base.detail}>Close One interrupts only for games with these teams in them.</Text>
      {failed ? (
        <View style={styles.fail}>
          <Text style={base.sub}>Could not load the team list. Check the server connection.</Text>
          <View style={base.actions}>
            <Button preferred label="Try again" onPress={() => setTries(n => n + 1)} />
            <View style={base.gap} />
            <Button label="Back" onPress={onBack} />
          </View>
        </View>
      ) : teams === null ? (
        <Text style={base.sub}>Loading teams</Text>
      ) : (
        <>
          <View style={styles.grid}>
            {teams.map((t, i) => (
              <View key={t.abbr} style={styles.cell}>
                <Button
                  compact
                  fill
                  preferred={i === 0}
                  selected={picked.includes(t.abbr)}
                  label={t.nick}
                  onPress={() => toggle(t.abbr)}
                />
              </View>
            ))}
          </View>
          <View style={styles.footer}>
            <Button
              primary
              label={saving ? 'Saving' : picked.length > 0 ? `${doneLabel ?? 'Done'}, following ${picked.length}` : doneLabel ?? 'Done'}
              onPress={saving ? () => undefined : save}
            />
            <View style={base.gap} />
            <Button label="Back" onPress={onBack} />
            {saveFailed ? <Text style={styles.err}>Could not save. Check the server connection and try again.</Text> : null}
          </View>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {paddingTop: space(40)},
  title: {color: color.text, fontSize: type.title, fontWeight: '800', marginTop: space(6)},
  grid: {flexDirection: 'row', flexWrap: 'wrap', marginTop: space(24)},
  cell: {width: space(262), marginRight: space(14), marginBottom: space(12)},
  footer: {flexDirection: 'row', alignItems: 'center', marginTop: space(16)},
  fail: {marginTop: space(24)},
  err: {color: color.stop, fontSize: type.label, marginLeft: space(40), flex: 1},
});
