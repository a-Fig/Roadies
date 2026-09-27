import {
  colorHex,
  sayPhrase,
  STATS_PATH,
  type CarProfile,
  type Lang,
  type LatLng,
  type Mode,
  type PublicStats,
} from '@roadies/shared';
import { useEffect, useState } from 'react';
import { CarIcon, GearIcon, PhoneIcon, ShuffleIcon } from '../components/icons';
import { unlockAudio } from '../lib/chimes';
import { Intro } from '../intro/Intro';
import { strings, type Strings } from '../lib/i18n';
import { DriveSession } from '../lib/session';
import { Drive } from './Drive';

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
  kicker: string;
}

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

/** How many people are talking on Roadies right now; polled while `active`. Null until known. */
function useDriversTalking(active: boolean): number | null {
  const [talking, setTalking] = useState<number | null>(null);
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    const load = async () => {
      // Background tabs don't poll: every request goes through the Cloudflare Worker.
      if (document.hidden) return;
      try {
        const res = await fetch(STATS_PATH, { cache: 'no-store' });
        if (!res.ok) return;
        const stats = (await res.json()) as PublicStats;
        if (!stopped) setTalking(stats.talking);
      } catch {
        // Offline for a moment: keep showing the last number.
      }
    };
    void load();
    const timer = setInterval(() => void load(), 5_000);
    const onVisible = () => void load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [active]);
  return talking;
}

/** The one tap that unlocks mic + audio, then the driving screen. */
export function Join({ mode, lang, profile, spot, kicker }: JoinProps) {
  const t = strings(lang);
  const [introDone, setIntroDone] = useState(false);
  const [session, setSession] = useState<DriveSession | null>(null);
  const [pending, setPending] = useState<'connect' | 'random' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const talking = useDriversTalking(!session);

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
    return () => {
      if (watch !== null) navigator.geolocation.clearWatch(watch);
      void session.stop();
    };
  }, [session, mode]);

  const join = async (cmd: 'connect' | 'random') => {
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

  if (!introDone) return <Intro onDone={() => setIntroDone(true)} />;
  if (session) return <Drive session={session} lang={lang} />;

  return (
    <main className="splash">
      <div className="jam-top">
        <div className="wordmark">
          <img src="/favicon.svg" alt="" width={40} height={40} />
          <span>Roadies</span>
        </div>
        {mode === 'live' && (
          <a className="icon-btn" href="/setup" aria-label={t.settings}>
            <GearIcon />
          </a>
        )}
      </div>

      <div className="jam-card">
        <p className="kicker">{kicker}</p>
        {/* Always rendered, so the layout below doesn't shift when the count arrives. */}
        <p className="live-count">
          {talking !== null && (
            <>
              <span className="live-dot" aria-hidden="true" />
              {talking === 0 ? t.nobodyTalking : t.driversTalking(talking)}
            </>
          )}
        </p>
        <div className="car-card">
          <span className="avatar big" style={{ color: colorHex(profile.color) }}>
            <CarIcon />
          </span>
          <div className="car-name">{t.youAre(profile.name)}</div>
        </div>
      </div>

      <nav className="options">
        <button className="option connect" aria-label={t.connect} disabled={!!pending} onClick={() => void join('connect')}>
          <span className="option-cmd">
            <PhoneIcon />
            {t.quote(sayPhrase(lang, 'connect'))}
          </span>
          {pending === 'connect' && <span className="option-desc">{t.starting}</span>}
        </button>
        <button className="option random" aria-label={t.random} disabled={!!pending} onClick={() => void join('random')}>
          <span className="option-cmd">
            <ShuffleIcon />
            {t.quote(sayPhrase(lang, 'random'))}
          </span>
          {pending === 'random' && <span className="option-desc">{t.starting}</span>}
        </button>
      </nav>

      {error && <p className="notice error">{error}</p>}
      <p className="fine">{t.privacy}</p>
    </main>
  );
}
