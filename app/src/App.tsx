import React, {useCallback, useEffect, useRef, useState} from 'react';
import {BackHandler, Linking} from 'react-native';
import {CUE_SERVICE_URI, DEFAULT_SERVER_URL, hostOf} from './config';
import {ApiError, Card, GameView, Quiet, ServerState, getState, localOffsetMin, sendFeedback, setFollow, setPause, setSettings} from './api';
import {getServerUrl, resetServerUrl, setServerUrl} from './session';
import {feedStatus} from './status';
import {CueCard} from './screens/CueCard';
import {GameLive} from './screens/GameLive';
import {Home} from './screens/Home';
import {QuietHours} from './screens/QuietHours';
import {ServerSettings} from './screens/ServerSettings';
import {Settings} from './screens/Settings';
import {ShowcaseScreen} from './screens/Showcase';
import {TurnOn} from './screens/TurnOn';
import {TeamPicker} from './screens/TeamPicker';

export const POLL_MS = 3000;

type Route =
  | {name: 'home'}
  | {name: 'card'; card: Card}
  | {name: 'game'; gameId: string}
  | {name: 'teams'}
  | {name: 'server'}
  | {name: 'settings'}
  | {name: 'quiet'}
  | {name: 'showcase'}
  | {name: 'onboarding'; step: 0 | 1 | 2};

// Nothing on Vega starts a [[components.service]] by itself. The app starts its own
// service by its pkg:// URI; the service then outlives the app's screen.
export const App = () => {
  const [state, setState] = useState<ServerState | null>(null);
  const [failures, setFailures] = useState(0);
  const [serverUrl, setServerUrlState] = useState(DEFAULT_SERVER_URL);
  const [route, setRoute] = useState<Route>({name: 'home'});
  const answered = useRef(new Set<number>());
  const onboardingOffered = useRef(false);
  const [draftQuiet, setDraftQuiet] = useState<Quiet | null>(null);
  const [turningOn, setTurningOn] = useState<'idle' | 'saving' | 'failed'>('idle');

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
      // A TV that has not opted in is taken through setup once, on the first launch. Nothing is sent before it finishes.
      if (!s.settings.onboarded && !onboardingOffered.current) {
        onboardingOffered.current = true;
        setDraftQuiet(s.settings.quiet);
        setRoute(r => (r.name === 'home' ? {name: 'onboarding', step: 0} : r));
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
      } else if (route.name === 'onboarding' && route.step > 0) {
        setRoute({name: 'onboarding', step: (route.step - 1) as 0 | 1});
      } else if (route.name === 'quiet') {
        setRoute({name: 'settings'});
      } else {
        setRoute({name: 'home'});
      }
      return true;
    });
    return () => sub.remove();
  }, [route, answer]);

  if (route.name === 'card') {
    const card = route.card;
    return <CueCard card={card} pressure={state?.games.find(g => g.id === card.gameId)?.pressure} onWatch={() => answer(card, 'accept')} onLater={() => answer(card, 'dismiss')} />;
  }
  if (route.name === 'game') {
    const game = state?.games.find((g: GameView) => g.id === route.gameId);
    return <GameLive game={game} bar={state?.learning.threshold ?? 0.3} onBack={() => setRoute({name: 'home'})} />;
  }
  if (route.name === 'onboarding') {
    if (route.step === 0) {
      return (
        <TeamPicker
          step="STEP 1 OF 3"
          doneLabel="Next"
          initial={state?.follow ?? []}
          onBack={() => setRoute({name: 'home'})}
          onSave={async abbrs => {
            await setFollow(abbrs);
            await poll();
            setRoute({name: 'onboarding', step: 1});
          }}
        />
      );
    }
    if (route.step === 1) {
      return (
        <QuietHours
          step="STEP 2 OF 3"
          value={draftQuiet}
          onChange={setDraftQuiet}
          nextLabel="Next"
          onNext={() => setRoute({name: 'onboarding', step: 2})}
          onBack={() => setRoute({name: 'onboarding', step: 0})}
        />
      );
    }
    return (
      <TurnOn
        teams={state?.followNames ?? []}
        quiet={draftQuiet}
        saving={turningOn === 'saving'}
        failed={turningOn === 'failed'}
        onBack={() => setRoute({name: 'onboarding', step: 1})}
        onTurnOn={async () => {
          setTurningOn('saving');
          try {
            await setSettings({onboarded: true, enabled: true, quiet: draftQuiet, offsetMin: localOffsetMin()});
            await poll();
            setTurningOn('idle');
            setRoute({name: 'home'});
          } catch {
            setTurningOn('failed');
          }
        }}
      />
    );
  }
  if (route.name === 'showcase') {
    return <ShowcaseScreen onBack={() => setRoute({name: 'home'})} />;
  }
  if (route.name === 'quiet') {
    return (
      <QuietHours
        value={draftQuiet}
        onChange={setDraftQuiet}
        nextLabel="Save"
        onNext={async () => {
          await setSettings({quiet: draftQuiet, offsetMin: localOffsetMin()});
          await poll();
          setRoute({name: 'settings'});
        }}
        onBack={() => setRoute({name: 'settings'})}
      />
    );
  }
  if (route.name === 'settings' && state) {
    return (
      <Settings
        settings={state.settings}
        teamCount={state.follow.length}
        teamNames={state.followNames}
        onBack={() => setRoute({name: 'home'})}
        onToggleCues={async () => {
          await setSettings({enabled: !state.settings.enabled});
          await poll();
        }}
        onTogglePause={async () => {
          await setPause(!state.settings.paused);
          await poll();
        }}
        onQuiet={() => {
          setDraftQuiet(state.settings.quiet);
          setRoute({name: 'quiet'});
        }}
        onTeams={() => setRoute({name: 'teams'})}
        onServer={() => setRoute({name: 'server'})}
      />
    );
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
            onboardingOffered.current = false;
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
          onboardingOffered.current = false;
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
      onPause={async () => {
        if (state) {
          await setPause(!state.settings.paused).catch(err => console.log(`CLUTCH_PAUSE_FAILED ${String(err)}`));
          await poll();
        }
      }}
      onShowcase={() => setRoute({name: 'showcase'})}
      onSettings={() => setRoute({name: 'settings'})}
      onSetup={() => setRoute({name: 'onboarding', step: 0})}
    />
  );
};
