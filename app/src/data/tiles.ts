import {ImageSourcePropType} from 'react-native';

export interface TileData {
  id: string;
  label: string;
  description: string;
  icon: ImageSourcePropType;
}

export const tiles: TileData[] = [
  {
    id: 'home',
    label: 'Home',
    description: 'Base app running on the Vega Virtual Device. Use the D-pad to move focus.',
    icon: require('../shared/assets/home.png'),
  },
  {
    id: 'games',
    label: 'Games',
    description: 'Followed games and the cue budget live here.',
    icon: require('../shared/assets/get-started.png'),
  },
  {
    id: 'service',
    label: 'Service',
    description: 'Background service and toast spike controls.',
    icon: require('../shared/assets/debug.png'),
  },
  {
    id: 'about',
    label: 'About',
    description: 'Vega SDK 0.24, React Native 0.83.',
    icon: require('../shared/assets/learn-more.png'),
  },
];
