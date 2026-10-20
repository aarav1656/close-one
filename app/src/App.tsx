import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Linking} from 'react-native';
import {CUE_SERVICE_URI} from './config';
import {Card, GameView, ServerState, getState, sendFeedback} from './api';
import {CueCard, GameLive, Home} from './screens';

const POLL_MS = 3000;

type Route = {name: 'home'} | {name: 'card'; card: Card} | {name: 'game'; gameId: string};

// Nothing on Vega starts a [[components.service]] by itself. The app starts its own
// service by its pkg:// URI; the service then outlives the app's screen.
export const App = () => {
  const [state, setState] = useState<ServerState | null>(null);
  const [offline, setOffline] = useState(false);
  const [route, setRoute] = useState<Route>({name: 'home'});
  const answered = useRef(new Set<number>());

  useEffect(() => {
    Linking.openURL(CUE_SERVICE_URI).then(
      () => console.log('CLUTCH_SERVICE_LAUNCH_SENT'),
      err => console.log(`CLUTCH_SERVICE_LAUNCH_FAILED ${String(err)}`),
    );
  }, []);

  useEffect(() => {
    let live = true;
    const poll = async () => {
      try {
        const s = await getState();
        if (!live) {
          return;
        }
        setState(s);
        setOffline(false);
        // A fresh cue puts its card in front, once: the household opened the app from the toast.
        if (s.active && !answered.current.has(s.active.id)) {
          const card = s.active;
          setRoute(r => (r.name === 'card' && r.card.id === card.id ? r : {name: 'card', card}));
        }
      } catch (err) {
        if (live) {
          setOffline(true);
        }
      }
    };
    poll();
    const t = setInterval(poll, POLL_MS);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);

  const answer = useCallback((card: Card, action: 'accept' | 'dismiss') => {
    answered.current.add(card.id);
    sendFeedback(card.id, action).catch(err => console.log(`CLUTCH_FEEDBACK_FAILED ${String(err)}`));
    setRoute(action === 'accept' ? {name: 'game', gameId: card.gameId} : {name: 'home'});
  }, []);

  if (route.name === 'card') {
    const card = route.card;
    return <CueCard card={card} onWatch={() => answer(card, 'accept')} onLater={() => answer(card, 'dismiss')} />;
  }
  if (route.name === 'game') {
    const game = state?.games.find((g: GameView) => g.id === route.gameId);
    return <GameLive game={game} onBack={() => setRoute({name: 'home'})} />;
  }
  return <Home state={state} offline={offline} onOpen={g => setRoute({name: 'game', gameId: g.id})} />;
};
