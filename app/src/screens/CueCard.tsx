import React, {useState} from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {Button} from '../ui/Button';
import {Pressure} from '../ui/Pressure';
import {Card} from '../api';
import {color, type, space} from '../theme';
import {base} from './styles';

export const CueCard = ({card, pressure, onWatch, onLater}: {card: Card; pressure?: number; onWatch: () => void; onLater: () => void}) => {
  const [why, setWhy] = useState(false);
  return (
    <View style={base.screen}>
      <Text style={base.kicker}>COMING DOWN TO THE WIRE</Text>
      <Text style={base.hero}>
        {card.away ?? 'Away'} at {card.home ?? 'Home'}
      </Text>
      <Text style={base.sub}>{card.when ?? card.body}</Text>
      {pressure !== undefined ? (
        <View style={styles.meter}>
          <Text style={base.label}>Pressure on the next possession</Text>
          <Pressure value={pressure} />
        </View>
      ) : null}
      {card.score ? <Text style={base.sub}>{card.score}</Text> : null}
      <View style={base.actions}>
        <Button primary preferred label="Watch" onPress={onWatch} />
        <View style={base.gap} />
        <Button label="Not now" onPress={onLater} />
        <View style={base.gap} />
        <Button label={why ? 'Hide reason' : 'Why now?'} onPress={() => setWhy(w => !w)} />
      </View>
      {why ? (
        <View style={styles.why} accessibilityLabel="Why now">
          <Text style={base.label}>WHY NOW</Text>
          <Text style={styles.whyText}>{card.why ?? 'This game crossed your bar.'}</Text>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  meter: {marginTop: space(36)},
  why: {marginTop: space(48), maxWidth: space(1400), backgroundColor: color.panel, padding: space(32), borderRadius: space(12)},
  whyText: {color: color.text, fontSize: type.body, lineHeight: type.body * 1.35},
});
