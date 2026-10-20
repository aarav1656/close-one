import React, {useCallback, useState} from 'react';
import {ImageBackground, StyleSheet, Text, View} from 'react-native';
import {Tile} from '../shared/components/Tile';
import {tiles} from '../data/tiles';
import {scaleFontSize, scaleWidth} from '../shared/utils/scaling';

export const HomeScreen = () => {
  const [focusedId, setFocusedId] = useState<string>('home');
  const focused = tiles.find(t => t.id === focusedId);

  const onFocus = useCallback((id: string) => {
    console.log(`CLUTCH_FOCUS ${id}`);
    setFocusedId(id);
  }, []);

  return (
    <ImageBackground
      source={require('../shared/assets/background.png')}
      style={styles.background}>
      <View style={styles.headerArea}>
        <Text style={styles.title}>{focused?.label}</Text>
        <Text style={styles.description}>{focused?.description}</Text>
      </View>
      <View style={styles.row}>
        {tiles.map(tile => (
          <Tile
            key={tile.id}
            id={tile.id}
            label={tile.label}
            icon={tile.icon}
            isFocused={focusedId === tile.id}
            onFocus={onFocus}
            onBlur={() => undefined}
            testID={`tile-${tile.id}`}
            accessibilityLabel={tile.label}
            hasTVPreferredFocus={tile.id === 'home'}
          />
        ))}
      </View>
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  background: {flex: 1, padding: scaleWidth(160)},
  headerArea: {flex: 3},
  title: {color: '#FFFFFF', fontSize: scaleFontSize(150), fontWeight: 'bold'},
  description: {color: '#FFFFFF', fontSize: scaleFontSize(60), marginTop: scaleWidth(24)},
  row: {flex: 1, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between'},
});
