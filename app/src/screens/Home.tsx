import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {Button} from '../ui/Button';
import {Pressure} from '../ui/Pressure';
import {Banner} from '../ui/Banner';
import {LearningBar} from '../ui/LearningBar';
import {GameView, ServerState, periodLabel, clockLabel, clockTime} from '../api';
import {FeedStatus} from '../status';
import {color, type, space} from '../theme';
import {base} from './styles';

interface Props {
  state: ServerState | null;
  status: FeedStatus;
  host: string;
  onOpen: (g: GameView) => void;
  onTeams: () => void;
  onServer: () => void;
}

const Moon = () => (
  <View style={styles.moon}>
    <View style={styles.moonBite} />
  </View>
);

const GameRow = ({g, preferred, onOpen}: {g: GameView; preferred: boolean; onOpen: (g: GameView) => void}) => (
  <View style={styles.row}>
    <View style={styles.rowHead}>
      <Button compact preferred={preferred} label={g.label} onPress={() => onOpen(g)} />
      <Text style={styles.rowText}>{g.status === 'final' ? 'Final' : `${periodLabel(g.period)} ${clockLabel(g.clock)}`}</Text>
    </View>
    <Pressure value={g.pressure} />
  </View>
);

export const Home = ({state, status, host, onOpen, onTeams, onServer}: Props) => {
  const games = state?.games ?? [];
  const mine = games.filter(g => g.followed);
  const others = games.filter(g => !g.followed);
  const following = state?.follow.length ?? 0;
  const used = state?.tonight.cues ?? 0;
  const cap = state?.tonight.cap ?? 2;
  const quiet = state?.tonight.quiet ?? false;
  const noTeams = state !== null && following === 0;
  // Exactly one control asks for first focus: the first game you follow, else the team picker.
  const preferGame = mine.length > 0;
  const preferChoose = noTeams && !preferGame;
  const next = state?.upcoming[0];

  const sub = !state
    ? 'Connecting'
    : quiet
    ? 'Quiet tonight. Back tomorrow.'
    : `${Math.max(0, cap - used)} of ${cap} interruptions left tonight`;

  return (
    <View style={base.screen}>
      <Text style={base.brand}>CLUTCH</Text>
      <Text style={base.sub}>{sub}</Text>
      {status.kind === 'offline' ? (
        <Banner
          tone="bad"
          title="Connection lost"
          detail={`Can't reach ${host}. Trying again every 3 seconds (attempt ${status.attempts}). What you see below is the last update.`}
        />
      ) : null}
      {status.kind === 'stale' ? (
        <Banner
          tone="warn"
          title="The game feed is behind"
          detail={
            status.ageMin === null
              ? 'Waiting for the first update from the NBA feed.'
              : `No update from the NBA feed for ${status.ageMin} min. Pressure bars may be out of date.`
          }
        />
      ) : null}
      <View style={styles.body}>
        <View style={styles.left}>
          {status.kind === 'loading' ? (
            <>
              <Text style={base.title}>Connecting to Clutch</Text>
              <Text style={base.detail}>Pairing this TV with your household at {host}.</Text>
            </>
          ) : noTeams ? (
            <>
              <Text style={base.title}>Pick the teams you follow</Text>
              <Text style={base.detail}>Clutch stays silent until you do. It only interrupts for games with your teams in them.</Text>
              <View style={styles.pad}>
                <Button preferred={preferChoose} primary label="Choose teams" onPress={onTeams} />
              </View>
            </>
          ) : (
            <>
              {mine.length > 0 ? (
                <>
                  <Text style={base.label}>Your teams tonight</Text>
                  {mine.map((g, i) => (
                    <GameRow key={g.id} g={g} preferred={i === 0} onOpen={onOpen} />
                  ))}
                </>
              ) : (
                <>
                  <Text style={base.title}>{games.length === 0 ? 'No live games right now' : 'Your teams are not playing right now'}</Text>
                  <Text style={base.detail}>
                    {next
                      ? `Next up: ${next.label} at ${clockTime(next.startsAt)}. Clutch cues you only when a game you follow gets tight.`
                      : 'Nothing on the NBA schedule at the moment. Clutch keeps watching and wakes up when a game tips off.'}
                  </Text>
                </>
              )}
              {others.length > 0 ? (
                <>
                  <Text style={[base.label, styles.otherLabel]}>Other games, not followed</Text>
                  {others.slice(0, 2).map(g => (
                    <GameRow key={g.id} g={g} preferred={false} onOpen={onOpen} />
                  ))}
                </>
              ) : null}
            </>
          )}
        </View>
        <View style={styles.right}>
          {quiet ? (
            <View accessibilityLabel="Quiet tonight">
              <Moon />
              <Text style={[base.title, styles.quietTitle]}>Quiet tonight</Text>
              <Text style={base.detail}>
                You passed on three cues within an hour, so Clutch stays silent until tomorrow. You can still open any game from here.
              </Text>
            </View>
          ) : state ? (
            <>
              <Text style={base.label}>Your bar tonight</Text>
              <LearningBar learning={state.learning} />
            </>
          ) : null}
        </View>
      </View>
      <View style={styles.footer}>
        <Button compact preferred={!preferGame && !preferChoose} label={following > 0 ? `Teams (${following})` : 'Teams'} onPress={onTeams} />
        <View style={base.gap} />
        <Button compact label="Server" onPress={onServer} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  body: {flexDirection: 'row', marginTop: space(36), flex: 1},
  left: {flex: 1, paddingRight: space(60)},
  right: {width: space(800)},
  row: {marginBottom: space(28)},
  rowHead: {flexDirection: 'row', alignItems: 'center', marginBottom: space(14)},
  rowText: {color: color.text, fontSize: type.label, marginLeft: space(28)},
  otherLabel: {marginTop: space(24)},
  pad: {marginTop: space(40)},
  footer: {flexDirection: 'row', paddingBottom: space(48)},
  moon: {width: space(96), height: space(96), borderRadius: space(48), backgroundColor: color.amber, overflow: 'hidden'},
  moonBite: {position: 'absolute', left: space(30), top: -space(8), width: space(88), height: space(88), borderRadius: space(44), backgroundColor: color.canvas},
  quietTitle: {marginTop: space(24)},
});
