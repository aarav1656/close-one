import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {Button} from '../ui/Button';
import {Pressure} from '../ui/Pressure';
import {Banner} from '../ui/Banner';
import {LearningBar} from '../ui/LearningBar';
import {GameView, ServerState, Summary, periodLabel, clockLabel, clockTime} from '../api';
import {quietLabel} from '../quiet';
import {FeedStatus} from '../status';
import {color, type, space} from '../theme';
import {base} from './styles';

interface Props {
  state: ServerState | null;
  status: FeedStatus;
  host: string;
  onOpen: (g: GameView) => void;
  onTeams: () => void;
  onPause: () => void;
  onShowcase: () => void;
  onSettings: () => void;
  onSetup: () => void;
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

const pts = (x: number) => Math.round(x * 100);

/** What Clutch did in a finished game, in plain words, with where the bar went. */
const SummaryLine = ({s}: {s: Summary}) => (
  <View style={styles.summary} accessibilityLabel={`Final: ${s.label}`}>
    <Text style={styles.summaryHead}>Final, {s.label}</Text>
    <Text style={base.detail}>
      {s.cues === 0
        ? 'Clutch stayed quiet. Nothing crossed your bar.'
        : `Clutch sent ${s.cues} cue${s.cues === 1 ? '' : 's'}: ${s.accepted} watched, ${s.dismissed} not now${s.waiting ? `, ${s.waiting} unanswered` : ''}. Bar ${pts(s.from)} to ${pts(s.to)}.`}
    </Text>
  </View>
);

export const Home = ({state, status, host, onOpen, onTeams, onPause, onShowcase, onSettings, onSetup}: Props) => {
  const games = state?.games ?? [];
  const mine = games.filter(g => g.followed);
  const others = games.filter(g => !g.followed);
  const following = state?.follow.length ?? 0;
  const used = state?.tonight.cues ?? 0;
  const cap = state?.tonight.cap ?? 2;
  const quiet = state?.tonight.quiet ?? false;
  const needsSetup = state !== null && !state.settings.onboarded;
  const noTeams = state !== null && state.settings.onboarded && following === 0;
  // Exactly one control asks for first focus: the first game you follow, else the team picker.
  const preferGame = mine.length > 0;
  const preferChoose = (noTeams || needsSetup) && !preferGame;
  const next = state?.upcoming[0];

  const silence = state?.settings.silence ?? null;
  const sub = !state
    ? 'Connecting'
    : silence === 'off'
    ? 'Cues are off'
    : silence === 'paused'
    ? 'Paused for tonight'
    : silence === 'quiet_hours'
    ? `Quiet hours, ${quietLabel(state.settings.quiet)}`
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
          ) : needsSetup ? (
            <>
              <Text style={base.title}>Set up Clutch</Text>
              <Text style={base.detail}>Pick your teams, choose quiet hours, then turn cues on. Until you do, Clutch sends nothing.</Text>
              <View style={styles.pad}>
                <Button preferred primary label="Set up Clutch" onPress={onSetup} />
              </View>
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
              {state && state.summaries.length > 0 ? <SummaryLine s={state.summaries[state.summaries.length - 1]} /> : null}
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
          {silence === 'off' || silence === 'paused' || silence === 'quiet_hours' ? (
            <View accessibilityLabel={silence === 'off' ? 'Cues are off' : silence === 'paused' ? 'Paused for tonight' : 'Quiet hours'}>
              <Moon />
              <Text style={[base.title, styles.quietTitle]}>{silence === 'off' ? 'Cues are off' : silence === 'paused' ? 'Paused for tonight' : 'Quiet hours'}</Text>
              <Text style={base.detail}>
                {silence === 'off'
                  ? 'No toast from any game until you turn cues back on in Settings.'
                  : silence === 'paused'
                  ? 'Every cue is silenced until tomorrow. Press Resume tonight to bring them back.'
                  : `No cue during ${quietLabel(state?.settings.quiet ?? null)}. Clutch is watching and comes back after.`}
              </Text>
            </View>
          ) : quiet ? (
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
        <View style={styles.gap} />
        <Button compact label={state?.settings.paused ? 'Resume tonight' : 'Pause tonight'} onPress={onPause} />
        <View style={styles.gap} />
        <Button compact label="Two rules" onPress={onShowcase} />
        <View style={styles.gap} />
        <Button compact label="Settings" onPress={onSettings} />
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
  pad: {marginTop: space(40), alignItems: 'flex-start'},
  gap: {width: space(24)},
  summary: {marginTop: space(20), paddingTop: space(16), borderTopWidth: space(2), borderTopColor: color.line},
  summaryHead: {color: color.text, fontSize: type.body, fontWeight: '700'},
  footer: {flexDirection: 'row', paddingBottom: space(48)},
  moon: {width: space(96), height: space(96), borderRadius: space(48), backgroundColor: color.amber, overflow: 'hidden'},
  moonBite: {position: 'absolute', left: space(30), top: -space(8), width: space(88), height: space(88), borderRadius: space(44), backgroundColor: color.canvas},
  quietTitle: {marginTop: space(24)},
});
