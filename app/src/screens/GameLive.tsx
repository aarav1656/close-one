import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {Button} from '../ui/Button';
import {Pressure} from '../ui/Pressure';
import {Columns} from '../ui/Timeline';
import {GameView, periodLabel, clockLabel} from '../api';
import {color, type, space} from '../theme';
import {base} from './styles';

const CHART_W = 1680;
const CHART_H = 300;
/** GameView pressure is win chance swing over 0.6, capped at 1; the chart and the bar speak win chance swing. */
const LEV_TOP = 0.6;
const pts = (x: number) => Math.round(x * 100);

/** Where Watch lands: how much of the game is left, and how the pressure built to the moment the household joined. */
export const GameLive = ({game, bar, onBack}: {game: GameView | undefined; bar: number; onBack: () => void}) => {
  const trail = game?.trail ?? [];
  return (
    <View style={base.screen}>
      <Text style={base.kicker}>{game?.status === 'final' ? 'FINAL' : 'LIVE'}</Text>
      <Text style={base.hero}>{game ? game.label : 'Game'}</Text>
      <Text style={styles.joining}>
        {!game
          ? 'This game is no longer on the feed.'
          : game.status === 'final'
          ? 'Final.'
          : `Joining with ${clockLabel(game.clock)} left in ${game.period <= 4 ? `the ${periodLabel(game.period)} quarter` : periodLabel(game.period)}`}
      </Text>
      {trail.length > 0 ? (
        <View style={styles.chart} accessibilityLabel={`Pressure over the last ${trail.length} updates against your bar of ${pts(bar)}`}>
          <Text style={base.label}>Pressure on the next possession, this game so far</Text>
          <Columns series={trail.map(p => p * LEV_TOP)} bar={bar} width={CHART_W} height={CHART_H} barLabel={`Your bar ${pts(bar)}`} />
          <View style={styles.axis}>
            <Text style={styles.axisText}>{trail.length} updates ago</Text>
            <Text style={[styles.axisText, styles.now]}>Now</Text>
          </View>
        </View>
      ) : (
        <View style={styles.meter}>
          <Text style={base.label}>Pressure on the next possession</Text>
          <Pressure value={game?.pressure ?? 0} />
        </View>
      )}
      <Button preferred label="Back" onPress={onBack} />
    </View>
  );
};

const styles = StyleSheet.create({
  joining: {color: color.text, fontSize: type.body, fontWeight: '700', marginTop: space(16)},
  chart: {marginTop: space(48), marginBottom: space(40)},
  meter: {marginTop: space(40), marginBottom: space(60)},
  axis: {flexDirection: 'row', justifyContent: 'space-between', width: space(CHART_W), marginTop: space(10)},
  axisText: {color: color.muted, fontSize: type.label},
  now: {color: color.amber, fontWeight: '700'},
});
