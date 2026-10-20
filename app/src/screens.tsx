import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {Button} from './ui/Button';
import {Pressure} from './ui/Pressure';
import {Card, GameView, ServerState, periodLabel, clockLabel} from './api';
import {color, type, space} from './theme';

export const Home = ({state, offline, onOpen}: {state: ServerState | null; offline: boolean; onOpen: (g: GameView) => void}) => {
  const games = state?.games ?? [];
  const used = state?.tonight.cues ?? 0;
  const cap = state?.tonight.cap ?? 2;
  return (
    <View style={styles.screen}>
      <Text style={styles.brand}>CLUTCH</Text>
      <Text style={styles.sub}>
        {offline
          ? 'Reconnecting to the game feed'
          : state?.tonight.quiet
          ? 'Quiet tonight. Back tomorrow.'
          : `${cap - used} of ${cap} interruptions left tonight`}
      </Text>
      <View style={styles.list}>
        {games.length === 0 ? (
          <Button preferred label="Watching the schedule" onPress={() => undefined} />
        ) : (
          games.map((g, i) => (
            <View key={g.id} style={styles.row}>
              <Button preferred={i === 0} label={g.label} onPress={() => onOpen(g)} />
              <Text style={styles.rowText}>
                {g.status === 'final' ? 'Final' : `${periodLabel(g.period)} ${clockLabel(g.clock)}`}
              </Text>
              <Pressure value={g.pressure} />
            </View>
          ))
        )}
      </View>
    </View>
  );
};

export const CueCard = ({card, onWatch, onLater}: {card: Card; onWatch: () => void; onLater: () => void}) => (
  <View style={styles.screen}>
    <Text style={styles.kicker}>COMING DOWN TO THE WIRE</Text>
    <Text style={styles.hero}>
      {card.away ?? 'Away'} at {card.home ?? 'Home'}
    </Text>
    <Text style={styles.sub}>{card.body.replace(' Press Menu to switch.', '')}</Text>
    {card.score ? <Text style={styles.sub}>{card.score}</Text> : null}
    <View style={styles.actions}>
      <Button primary preferred label="Watch" onPress={onWatch} />
      <View style={{width: space(40)}} />
      <Button label="Not now" onPress={onLater} />
    </View>
  </View>
);

export const GameLive = ({game, onBack}: {game: GameView | undefined; onBack: () => void}) => (
  <View style={styles.screen}>
    <Text style={styles.kicker}>{game?.status === 'final' ? 'FINAL' : 'LIVE'}</Text>
    <Text style={styles.hero}>{game ? game.label : 'Game'}</Text>
    <Text style={styles.sub}>{game ? `${periodLabel(game.period)}, ${clockLabel(game.clock)} left` : ''}</Text>
    <View style={{marginTop: space(40), marginBottom: space(60)}}>
      <Text style={styles.label}>Pressure on the next possession</Text>
      <Pressure value={game?.pressure ?? 0} />
    </View>
    <Button preferred label="Back" onPress={onBack} />
  </View>
);

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: color.canvas, paddingHorizontal: space(160), paddingTop: space(120)},
  brand: {color: color.amber, fontSize: type.title, fontWeight: '800', letterSpacing: 8},
  kicker: {color: color.amber, fontSize: type.label, fontWeight: '700', letterSpacing: 6},
  hero: {color: color.text, fontSize: type.hero, fontWeight: '800', marginTop: space(12)},
  sub: {color: color.muted, fontSize: type.body, marginTop: space(16)},
  label: {color: color.muted, fontSize: type.label, marginBottom: space(16)},
  list: {marginTop: space(60)},
  row: {flexDirection: 'row', alignItems: 'center', marginBottom: space(24)},
  rowText: {color: color.text, fontSize: type.body, marginHorizontal: space(40), minWidth: space(260)},
  actions: {flexDirection: 'row', marginTop: space(80)},
});
