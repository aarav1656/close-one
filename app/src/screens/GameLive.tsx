import React from 'react';
import {View, Text} from 'react-native';
import {Button} from '../ui/Button';
import {Pressure} from '../ui/Pressure';
import {GameView, periodLabel, clockLabel} from '../api';
import {space} from '../theme';
import {base} from './styles';

export const GameLive = ({game, onBack}: {game: GameView | undefined; onBack: () => void}) => (
  <View style={base.screen}>
    <Text style={base.kicker}>{game?.status === 'final' ? 'FINAL' : 'LIVE'}</Text>
    <Text style={base.hero}>{game ? game.label : 'Game'}</Text>
    <Text style={base.sub}>{game ? `${periodLabel(game.period)}, ${clockLabel(game.clock)} left` : 'This game is no longer on the feed.'}</Text>
    <View style={{marginTop: space(40), marginBottom: space(60)}}>
      <Text style={base.label}>Pressure on the next possession</Text>
      <Pressure value={game?.pressure ?? 0} />
    </View>
    <Button preferred label="Back" onPress={onBack} />
  </View>
);
