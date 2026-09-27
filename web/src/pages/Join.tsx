import type { CarProfile, Lang, LatLng, Mode } from '@roadies/shared';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { unlockAudio } from '../lib/chimes';
import { Intro } from '../intro/Intro';
import { setLang, strings, type Strings } from '../lib/i18n';
import { saveDemoCar, saveProfile } from '../lib/identity';
import { DriveSession, type SessionView } from '../lib/session';
import { keepScreenOn } from '../lib/wakelock';
import { Drive } from './Drive';
import { Setup } from './Setup';
import { YourJam } from './YourJam';

declare global {
  interface Window {
    /** Exposed for end-to-end tests and debugging. */
    __roadies?: DriveSession;
  }
}

interface JoinProps {
  mode: Mode;
  lang: Lang;
  profile: CarProfile;
  spot?: string;
}

/**
 * Where the browser's history says we are. The screen itself is derived from
 * the server's state (connected = voice chat, otherwise Your jam); these
 * entries only exist so the phone's back button does the obvious thing:
 * back from the voice chat = disconnect, back from Settings = where you were.
 */
type Nav = 'jam' | 'call' | 'settings';
const navOf = (state: unknown): Nav => {
  const nav = (state as { roadies?: unknown } | null)?.roadies;
  return nav === 'call' || nav === 'settings' ? nav : 'jam';
};

function currentPosition(t: Strings): Promise<LatLng> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error(t.noGps));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (err) => reject(new Error(err.code === err.PERMISSION_DENIED ? t.needLocation : err.message)),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  });
}

const noop = () => () => {};
const none = () => null;

/** The session's view, or null before the first tap. */
function useSessionView(session: DriveSession | null): SessionView | null {
  return useSyncExternalStore(session?.subscribe ?? noop, session?.getView ?? none);
}

/**
 * The phone app: the intro (once per open), then Your jam, the voice chat and
 * Settings. One `DriveSession` lives here for the whole visit, so leaving a
 * call (the server keeps you as a listening "ghost") lands back on Your jam
 * with its cards wired to what "connect"/"random" would do right now, and
 * Settings opens in place without dropping the call.
 */
export function Join({ mode, lang: initialLang, profile: initialProfile, spot }: JoinProps) {
  const [lang, setLangState] = useState(initialLang);
  const [profile, setProfile] = useState(initialProfile);
  const t = strings(lang);
  const [introDone, setIntroDone] = useState(false);
  const [session, setSession] = useState<DriveSession | null>(null);
  const [pending, setPending] = useState<'connect' | 'random' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wasHidden, setWasHidden] = useState(false);
  const [nav, setNav] = useState<Nav>('jam');
  const view = useSessionView(session);
  const connected = !!view?.state.connected;

  const navRef = useRef(nav);
  navRef.current = nav;
  const sessionRef = useRef(session);
  sessionRef.current = session;
  /** Back was pressed in a call: the disconnect is on its way, don't re-push the call entry meanwhile. */
  const leavingRef = useRef(false);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  // A reload lands on whatever entry we left: there's no call or Settings to
  // go back to yet, so start from a plain one.
  useEffect(() => {
    if (history.state?.roadies) history.replaceState(null, '');
    const onPop = (e: PopStateEvent) => {
      const next = navOf(e.state);
      const s = sessionRef.current;
      // Back out of the voice chat = the normal "disconnect" command (server
      // path, chime and all), which also lands us on Your jam.
      if (navRef.current === 'call' && next === 'jam' && s?.getView().state.connected) {
        leavingRef.current = true;
        s.command('disconnect');
      }
      setNav(next);
    };
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);

  // Mirror the server's state into history: a call gets its own entry (so back
  // leaves it), and a call that ended some other way (button, voice, merge)
  // drops that entry again.
  useEffect(() => {
    if (!connected) leavingRef.current = false;
    if (connected && nav === 'jam' && !leavingRef.current) {
      history.pushState({ roadies: 'call' }, '');
      setNav('call');
    } else if (!connected && nav === 'call') {
      history.back();
    }
  }, [connected, nav]);

  // A command card tapped while listening as a ghost stays "chosen" until the
  // server answers (a room, or a notice that there was nowhere to go).
  useEffect(() => setPending(null), [connected, view?.notice]);

  useEffect(() => {
    if (!session) return;
    let watch: number | null = null;
    if (mode === 'live') {
      watch = navigator.geolocation.watchPosition(
        (p) => session.updatePosition({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => {},
        { enableHighAccuracy: true, maximumAge: 5_000 },
      );
    }
    const releaseScreen = keepScreenOn();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') setWasHidden(true);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      if (watch !== null) navigator.geolocation.clearWatch(watch);
      releaseScreen();
      document.removeEventListener('visibilitychange', onVisibility);
      void session.stop();
    };
  }, [session, mode]);

  const join = async (cmd: 'connect' | 'random') => {
    if (session) {
      // Already listening (after a disconnect): the same command the voice would send.
      setPending(cmd);
      session.command(cmd);
      return;
    }
    setPending(cmd);
    setError(null);
    unlockAudio();
    const s = new DriveSession({ mode, lang, profile, spot, join: cmd === 'random' ? 'random' : undefined });
    try {
      await s.voice.prepareMic();
      if (mode === 'live') s.updatePosition(await currentPosition(t));
    } catch (err) {
      await s.stop();
      setPending(null);
      const message = (err as Error).message;
      setError(/permission|denied|not allowed/i.test(message) ? t.needMic : message);
      return;
    }
    window.__roadies = s;
    s.start();
    setSession(s);
  };

  const openSettings = useCallback(() => {
    if (navRef.current === 'settings') return;
    history.pushState({ roadies: 'settings' }, '');
    setNav('settings');
  }, []);

  const saveSettings = (next: CarProfile, nextLang: Lang) => {
    setLang(nextLang);
    if (mode === 'live') saveProfile(next);
    else saveDemoCar(next);
    setLangState(nextLang);
    setProfile(next);
    session?.updateIdentity(next, nextLang);
    history.back();
  };

  if (!introDone) return <Intro onDone={() => setIntroDone(true)} />;

  if (nav === 'settings') {
    return (
      <Setup inApp={{ mode, lang, profile: view?.profile ?? profile, onSave: saveSettings, onBack: () => history.back() }} />
    );
  }

  const hiddenNotice = wasHidden ? (
    <button className="notice" onClick={() => setWasHidden(false)}>
      {t.keepOnScreen} <u>{t.ok}</u>
    </button>
  ) : null;

  if (session && view && connected) {
    return (
      <Drive session={session} view={view} lang={lang} onSettings={openSettings}>
        {hiddenNotice}
      </Drive>
    );
  }

  return (
    <YourJam
      mode={mode}
      lang={lang}
      profile={view?.profile ?? profile}
      view={view}
      pending={pending}
      error={error ?? view?.error ?? null}
      onCommand={(cmd) => void join(cmd)}
      onSettings={openSettings}
    >
      {hiddenNotice}
    </YourJam>
  );
}
