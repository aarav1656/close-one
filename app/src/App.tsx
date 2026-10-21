import React, {useCallback, useEffect, useRef, useState} from 'react';
import {BackHandler, Linking} from 'react-native';
import {CUE_SERVICE_URI, DEFAULT_SERVER_URL, hostOf} from './config';
import {ApiError, Card, GameView, ServerState, getState, sendFeedback, setFollow} from './api';
import {getServerUrl, resetServerUrl, setServerUrl} from './session';
import {feedStatus} from './status';
import {CueCard} from './screens/CueCard';
import {GameLive} from './screens/GameLive';
import {Home} from './screens/Home';
import {ServerSettings} from './screens/ServerSettings';
import {TeamPicker} from './screens/TeamPicker';

export const POLL_MS = 3000;

type Route =
  | {name: 'home'}
  | {name: 'card'; card: Card}
  | {name: 'game'; gameId: string}
  | {name: 'teams'}
  | {name: 'server'};

// Nothing on Vega starts a [[components.service]] by itself. The app starts its own
// service by its pkg:// URI; the service then outlives the app's screen.
export const App = () => {
  const [state, setState] = useState<ServerState | null>(null);
  const [failures, setFailures] = useState(0);
  const [serverUrl, setServerUrlState] = useState(DEFAULT_SERVER_URL);
  const [route, setRoute] = useState<Route>({name: 'home'});
  const answered = useRef(new Set<number>());
  const pickerSeen = useRef(false);

  useEffect(() => {
    Linking.openURL(CUE_SERVICE_URI).then(
      () => console.log('CLUTCH_SERVICE_LAUNCH_SENT'),
      err => console.log(`CLUTCH_SERVICE_LAUNCH_FAILED ${String(err)}`),
    );
  }, []);

  const poll = useCallback(async (isLive: () => boolean = () => true) => {
    try {
      const s = await getState();
      if (!isLive()) {
        return;
      }
      setState(s);
      setFailures(0);
      // A household that follows nobody is sent to the picker once, on the first launch.
      if (s.follow.length === 0 && !pickerSeen.current) {
        pickerSeen.current = true;
        setRoute(r => (r.name === 'home' ? {name: 'teams'} : r));
      }
      // A fresh cue puts its card in front, once: the household opened the app from the toast.
      if (s.active && !answered.current.has(s.active.id)) {
        const card = s.active;
        setRoute(r => (r.name === 'card' && r.card.id === card.id ? r : {name: 'card', card}));
      }
    } catch (err) {
      console.log(`CLUTCH_POLL_FAILED ${err instanceof ApiError ? err.status : String(err)}`);
      if (isLive()) {
        setFailures(n => n + 1);
      }
    }
  }, []);

  useEffect(() => {
    let live = true;
    getServerUrl().then(u => live && setServerUrlState(u));
    poll(() => live);
    const t = setInterval(() => poll(() => live), POLL_MS);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [poll]);

  const answer = useCallback((card: Card, action: 'accept' | 'dismiss') => {
    answered.current.add(card.id);
    sendFeedback(card.id, action).catch(err => console.log(`CLUTCH_FEEDBACK_FAILED ${String(err)}`));
    setRoute(action === 'accept' ? {name: 'game', gameId: card.gameId} : {name: 'home'});
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (route.name === 'home') {
        return false;
      }
      if (route.name === 'card') {
        answer(route.card, 'dismiss');
      } else {
        setRoute({name: 'home'});
      }
      return true;
    });
    return () => sub.remove();
  }, [route, answer]);

  if (route.name === 'card') {
    const card = route.card;
    return <CueCard card={card} onWatch={() => answer(card, 'accept')} onLater={() => answer(card, 'dismiss')} />;
  }
  if (route.name === 'game') {
    const game = state?.games.find((g: GameView) => g.id === route.gameId);
    return <GameLive game={game} onBack={() => setRoute({name: 'home'})} />;
  }
  if (route.name === 'teams') {
    return (
      <TeamPicker
        initial={state?.follow ?? []}
        onBack={() => setRoute({name: 'home'})}
        onSave={async abbrs => {
          await setFollow(abbrs);
          await poll();
          setRoute({name: 'home'});
        }}
      />
    );
  }
  if (route.name === 'server') {
    return (
      <ServerSettings
        current={serverUrl}
        defaultUrl={DEFAULT_SERVER_URL}
        onBack={() => setRoute({name: 'home'})}
        onSave={async url => {
          const ok = await setServerUrl(url);
          if (ok) {
            setState(null);
            setFailures(0);
            pickerSeen.current = false;
            setServerUrlState(url);
            setRoute({name: 'home'});
            await poll();
          }
          return ok;
        }}
        onReset={async () => {
          await resetServerUrl();
          setState(null);
          setFailures(0);
          pickerSeen.current = false;
          setServerUrlState(DEFAULT_SERVER_URL);
          setRoute({name: 'home'});
          await poll();
        }}
      />
    );
  }
  return (
    <Home
      state={state}
      status={feedStatus(state, failures)}
      host={hostOf(serverUrl)}
      onOpen={g => setRoute({name: 'game', gameId: g.id})}
      onTeams={() => setRoute({name: 'teams'})}
      onServer={() => setRoute({name: 'server'})}
    />
  );
};
