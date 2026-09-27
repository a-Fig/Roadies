import { colorHex, sayPhrase, STATS_PATH, type CarProfile, type Lang, type Mode, type PublicStats } from '@roadies/shared';
import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import carRed from '../assets/car-red-intro.png';
import carTeal from '../assets/car-teal-intro.png';
import { CarArt } from '../components/CarArt';
import { LineMic, LineSettings, LineShieldCheck, LineUsers, Wordmark } from '../components/icons';
import { capitalize, strings } from '../lib/i18n';
import type { SessionView } from '../lib/session';

/**
 * The road the demo corridor follows (shared/src/corridor.ts). A route name,
 * not a translatable word. En dash on purpose: Bepory draws "-" like a "+".
 */
const DEMO_ROAD = 'US–101 N';
const NOTICE_FLASH_MS = 4000;

/** How many people are talking on Roadies right now, polled while this screen is up. Null until known. */
function useDriversTalking(): number | null {
  const [talking, setTalking] = useState<number | null>(null);
  useEffect(() => {
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
  }, []);
  return talking;
}

/** True while `at` is less than `ms` old; re-renders once when it expires. */
function useFresh(at: number | undefined, ms: number): boolean {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (at === undefined) return;
    const timer = setTimeout(() => setTick((n) => n + 1), Math.max(0, at + ms - Date.now()));
    return () => clearTimeout(timer);
  }, [at, ms]);
  return at !== undefined && Date.now() - at < ms;
}

/** Opens Settings in place (a real link, so it still works as one). */
export function settingsLink(onSettings: () => void) {
  return {
    href: '/setup',
    onClick: (e: MouseEvent) => {
      e.preventDefault();
      onSettings();
    },
  };
}

interface YourJamProps {
  mode: Mode;
  lang: Lang;
  profile: CarProfile;
  /** The live session once there is one: after a disconnect you're a listening "ghost". */
  view: SessionView | null;
  pending: 'connect' | 'random' | null;
  error: string | null;
  onCommand: (cmd: 'connect' | 'random') => void;
  onSettings: () => void;
  children?: ReactNode;
}

/**
 * Her "Your jam" home: wordmark, the teal jam card with the live head count,
 * and the two spoken commands as big cards. The same screen before the first
 * tap and after leaving a call; afterwards the cards say what "connect" and
 * "random" would do right now (the server's `closest` preview).
 */
export function YourJam({ mode, lang, profile, view, pending, error, onCommand, onSettings, children }: YourJamProps) {
  const t = strings(lang);
  const talking = useDriversTalking();
  const noticeFresh = useFresh(view?.notice?.at, NOTICE_FLASH_MS);
  const cmdWord = (cmd: 'connect' | 'random') => t.quote(capitalize(lang, sayPhrase(lang, cmd)));

  // Listening as a ghost: the cards describe the live match; otherwise what each one does.
  const ghost = !!view && !view.state.connected;
  const closest = view?.closest;
  const connectDesc = ghost ? (closest ? `${closest.name} · ${closest.roomName}` : t.newRoom) : t.connectDesc;

  const card = (cmd: 'connect' | 'random', desc: string, enabled: boolean) => (
    <button
      className={`command ${pending === cmd ? 'is-chosen' : ''}`}
      aria-label={capitalize(lang, sayPhrase(lang, cmd))}
      disabled={!!pending || !enabled}
      onClick={() => onCommand(cmd)}
    >
      <span className="command-word">{cmdWord(cmd)}</span>
      <span className="command-desc">{pending === cmd ? t.starting : desc}</span>
    </button>
  );

  return (
    <main className="screen home">
      <header className="home-top">
        <Wordmark />
        <a className="me-chip" aria-label={t.settings} {...settingsLink(onSettings)}>
          <CarArt color={colorHex(profile.color)} size={34} />
          <span className="me-name">{profile.name}</span>
          <LineSettings className="me-gear" />
        </a>
      </header>

      <section className="jam-card">
        <div className="jam-cars" aria-hidden="true">
          <img src={carRed} alt="" />
          <img src={carTeal} alt="" />
        </div>
        <p className="eyebrow">{mode === 'demo' ? t.stuckOn : t.liveEyebrow}</p>
        <h1 className="jam-road">{mode === 'demo' ? DEMO_ROAD : t.yourJam}</h1>
        {/* Always rendered, so the card doesn't grow when the count arrives. */}
        <p className="jam-drivers" data-known={talking !== null}>
          <LineUsers />
          {talking !== null ? t.driversTalking(talking) : ' '}
        </p>
      </section>

      {children}
      {error && <p className="notice error">{error}</p>}
      {noticeFresh && view?.notice && !error && <p className="notice">{t.notices[view.notice.code]}</p>}

      <section className="voice">
        {ghost && (
          <>
            {/* Her listening orb: true here, the server hears "connect" and "random". */}
            <div className="orb" aria-hidden="true">
              <LineMic />
            </div>
            <p className="say-label">{t.justSay}</p>
          </>
        )}
        <nav className="commands">
          {card('connect', connectDesc, true)}
          {card('random', t.randomDesc, true)}
        </nav>
      </section>

      <p className="safety">
        <LineShieldCheck />
        {t.eyesOnRoad}
      </p>
    </main>
  );
}
