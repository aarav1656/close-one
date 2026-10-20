import React, {useEffect} from 'react';
import {Linking} from 'react-native';
import {HomeScreen} from './screens/HomeScreen';
import {CUE_SERVICE_URI} from './config';

// Nothing on Vega starts a [[components.service]] by itself. The app starts its own
// service by its pkg:// URI; the service then outlives the app's screen.
export const App = () => {
  useEffect(() => {
    Linking.openURL(CUE_SERVICE_URI).then(
      () => console.log('CLUTCH_SERVICE_LAUNCH_SENT'),
      err => console.log(`CLUTCH_SERVICE_LAUNCH_FAILED ${String(err)}`),
    );
  }, []);
  return <HomeScreen />;
};
