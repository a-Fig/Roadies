import {
  colorHex,
  COMMANDS,
  sayPhrase,
  STATS_PATH,
  type CarProfile,
  type Lang,
  type LatLng,
  type Mode,
  type PublicStats,
} from '@roadies/shared';
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { CarIcon } from '../components/icons';
import { unlockAudio } from '../lib/chimes';
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
  cta: string;
  footer?: ReactNode;
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
export function Join({ mode, lang, profile, spot, kicker, cta, footer }: JoinProps) {
  const t = strings(lang);
  const [session, setSession] = useState<DriveSession | null>(null);
  const [busy, setBusy] = useState(false);
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

  const join = async () => {
    setBusy(true);
    setError(null);
    unlockAudio();
    const s = new DriveSession({ mode, lang, profile, spot });
    try {
      await s.voice.prepareMic();
      if (mode === 'live') s.updatePosition(await currentPosition(t));
    } catch (err) {
      await s.stop();
      setBusy(false);
      const message = (err as Error).message;
      setError(/permission|denied|not allowed/i.test(message) ? t.needMic : message);
      return;
    }
    window.__roadies = s;
    s.start();
    setSession(s);
  };

  if (session) return <Drive session={session} lang={lang} />;

  const phrases = COMMANDS.map((cmd) => sayPhrase(lang, cmd));

  return (
    <main className="splash">
      <div className="brand">
        <img src="/favicon.svg" alt="" width={56} height={56} />
        <span>Roadies</span>
      </div>
      <p className="kicker">{kicker}</p>
      {/* Always rendered, so the button below doesn't shift when the count arrives. */}
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
        <div>
          <div className="car-name">{t.youAre(profile.name)}</div>
          <div className="car-sub">{t.tagline}</div>
        </div>
      </div>
      <button className="primary big" onClick={() => void join()} disabled={busy}>
        {busy ? t.starting : cta}
      </button>
      {error && <p className="notice error">{error}</p>}
      <p className="fine">
        {t.handsFree}{' '}
        {phrases.map((p, i) => (
          <Fragment key={p}>
            {i > 0 && (i < phrases.length - 1 ? ', ' : ` ${t.or} `)}
            <b>{p}</b>
          </Fragment>
        ))}
        . {t.privacy}
      </p>
      {footer}
    </main>
  );
}
