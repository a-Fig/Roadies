import { colorHex, isTransmitting, sayPhrase, type Command, type Lang, type RosterMember } from '@roadies/shared';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { CarArt } from '../components/CarArt';
import { CarIcon, HangUpIcon, HeadphonesIcon, MicIcon, SpeakerIcon } from '../components/icons';
import { unlockAudio } from '../lib/chimes';
import { strings } from '../lib/i18n';
import type { DriveSession } from '../lib/session';
import { keepScreenOn } from '../lib/wakelock';

const HEARD_FLASH_MS = 2500;
const NOTICE_FLASH_MS = 4000;

/** What the disconnected hint strip tells you to say to get back in. Connected and quiet
 * shows no persistent command list (minimal-text rule; the muted/deafened pill covers that). */
const HINTED_DISCONNECTED: Command[] = ['connect', 'random'];

/** A button label; a word longer than "Disconnect" ("Déconnexion") gets the smaller `long` size. */
function Label({ text }: { text: string }) {
  const long = text.split(' ').some((word) => word.length > 10);
  return <span className={long ? 'long' : undefined}>{text}</span>;
}

/** Glanceable driving mode: one status line, giant buttons, voice commands. */
export function Drive({ session, lang }: { session: DriveSession; lang: Lang }) {
  const t = strings(lang);
  /** A command's spoken phrase, quoted the language's way: “unmute”, « active le micro ». */
  const say = (cmd: Command) => t.quote(sayPhrase(lang, cmd));
  const view = useSyncExternalStore(session.subscribe, session.getView);
  const { state, room, profile, myId } = view;
  const [now, setNow] = useState(Date.now());
  const [wasHidden, setWasHidden] = useState(false);

  useEffect(() => keepScreenOn(), []);
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') setWasHidden(true);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
  // Re-render to expire the "heard" flash.
  useEffect(() => {
    if (!view.heard) return;
    const t = setTimeout(() => setNow(Date.now()), HEARD_FLASH_MS);
    return () => clearTimeout(t);
  }, [view.heard]);
  // Re-render to expire the notice flash.
  useEffect(() => {
    if (!view.notice) return;
    const t = setTimeout(() => setNow(Date.now()), NOTICE_FLASH_MS);
    return () => clearTimeout(t);
  }, [view.notice]);

  const members = room?.members ?? [];
  const others = members.filter((m) => m.id !== myId);
  const talking = others.filter((m) => view.speakers.includes(m.id) && isTransmitting(m.state));
  const meTalking = !!myId && view.speakers.includes(myId) && isTransmitting(state);

  const tone = !state.connected ? 'off' : state.selfDeaf ? 'deaf' : state.selfMute ? 'muted' : 'live';
  const send = (cmd: Command) => session.command(cmd);

  // "connect"'s live context, shown in its card on the disconnected screen below.
  // Kept to a name and a room — glanceable, not a sentence (owner rule).
  const closest = view.closest;
  const connectContext = closest ? `${closest.name} · ${closest.roomName}` : t.newRoom;

  let title: string;
  let subtitle: string;
  if (!state.connected) {
    title = t.disconnected;
    subtitle = t.listeningFor(`${say('connect')} ${t.or} ${say('random')}`);
  } else if (!room) {
    title = t.finding;
    subtitle = view.socket === 'open' ? t.matching : t.connecting;
  } else {
    // Room names are place names: never translated. Always a count (her
    // room-sub is just as glanceable alone as with company) - no "Just you
    // so far" sentence.
    title = room.name;
    subtitle = t.roomCount(members.length);
  }

  // Only worth a glance when there's something to report; no idle "Quiet
  // road" filler (minimal-text rule - her room screen has none either).
  // Disconnected already says "Listening for ..." in the subtitle above -
  // no second "Say ... to rejoin" line repeating the same two words.
  let talkLine: string | null;
  if (!state.connected) talkLine = null;
  else if (talking.length > 0) talkLine = t.talking(talking.map((m) => m.name));
  else if (meTalking) talkLine = t.onAir;
  else if (state.selfDeaf) talkLine = t.cantHear;
  else talkLine = null;

  const isMuted = (m: RosterMember) => m.state.selfMute || m.state.selfDeaf;
  const isSpeaking = (m: RosterMember) => view.speakers.includes(m.id) && isTransmitting(m.state);

  const heardFresh = view.heard && now - view.heard.at < HEARD_FLASH_MS ? view.heard : null;
  const noticeFresh = view.notice && now - view.notice.at < NOTICE_FLASH_MS ? view.notice : null;
  // Connected and quiet: no persistent "Say: mute · unmute · ..." reminder
  // (minimal-text rule; the muted/deafened pill below already carries that
  // cue). The disconnected fallback stays - it's the hands-free way back in.
  const hint = heardFresh
    ? heardFresh.source === 'presenter'
      ? t.presenterUsed(say(heardFresh.cmd))
      : t.heard(say(heardFresh.cmd))
    : state.connected
      ? ''
      : `${t.say} ${HINTED_DISCONNECTED.map((cmd) => sayPhrase(lang, cmd)).join(' · ')}`;

  return (
    // Any tap re-unlocks audio: iOS suspends it after a lock screen or phone call.
    <main className="drive brand-kit" data-tone={tone} onPointerDown={unlockAudio}>
      <header className="drive-top">
        <div className={`voice-status ${view.voiceConnected && state.connected ? 'ok' : ''}`}>
          <span className="signal" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          {!state.connected ? t.voiceDisconnected : view.voiceConnected ? t.voiceConnected : t.voiceConnecting}
        </div>
        <div className="me">
          <span className="avatar" style={{ color: colorHex(profile.color) }}>
            <CarIcon />
          </span>
          {profile.name}
        </div>
      </header>

      <section className="status" aria-live="polite">
        <h1 className="status-title">
          {state.connected && room && <SpeakerIcon className="status-icon" />}
          {title}
        </h1>
        <p className="status-sub">{subtitle}</p>
        {talkLine && (
          <p className={`talking ${talking.length || meTalking ? 'on' : ''}`} data-testid="talking">
            <span className="talking-dot" aria-hidden="true" />
            {talkLine}
          </p>
        )}
        {tone === 'muted' && <p className="banner">{t.mutedBanner(say('unmute'))}</p>}
        {tone === 'deaf' && <p className="banner">{t.deafenedBanner(say('undeafen'))}</p>}
      </section>

      {state.connected && room && (
        <div className="avatar-grid" data-testid="avatar-grid">
          {/* Her round tinted circle + car art, cream so it reads against any tint:
              "you" gets an orange circle (not your own car color, so it never
              blends in), everyone else a circle tinted with their own car color. */}
          <div className={`avatar-tile ${meTalking ? 'speaking' : ''}`}>
            <span className="badge">
              <span className="avatar-circle" style={{ background: '#f4682c' }}>
                <CarArt color="#fffcee" size={40} title={profile.name} />
              </span>
              {(state.selfMute || state.selfDeaf) && (
                <span className="muted-badge" aria-hidden="true">
                  <MicIcon slashed />
                </span>
              )}
            </span>
            <span className="name">{profile.name}</span>
          </div>
          {others.slice(0, 3).map((m) => (
            <div key={m.id} className={`avatar-tile ${isSpeaking(m) ? 'speaking' : ''}`}>
              <span className="badge">
                <span className="avatar-circle" style={{ background: colorHex(m.color) }}>
                  <CarArt color="#fffcee" size={40} title={m.name} />
                </span>
                {isMuted(m) && (
                  <span className="muted-badge" aria-hidden="true">
                    <MicIcon slashed />
                  </span>
                )}
              </span>
              <span className="name">{m.name}</span>
            </div>
          ))}
        </div>
      )}

      {view.audioBlocked && state.connected && (
        <button className="notice" onClick={() => void session.voice.startAudio()}>
          🔈 {t.tapForSound}
        </button>
      )}
      {wasHidden && (
        <button className="notice" onClick={() => setWasHidden(false)}>
          {t.keepOnScreen} <u>{t.ok}</u>
        </button>
      )}
      {view.error && <p className="notice error">{view.error}</p>}
      {noticeFresh && !view.error && <p className="notice">{t.notices[noticeFresh.code]}</p>}

      <p className={`hint ${heardFresh ? 'flash' : ''}`} data-testid="hint">
        {hint}
      </p>

      {state.connected ? (
        <nav className="controls">
          <button
            className={`ctl ${state.selfMute || state.selfDeaf ? 'on' : ''}`}
            aria-pressed={state.selfMute}
            aria-label={state.selfMute ? t.unmute : t.mute}
            onClick={() => send(state.selfMute || state.selfDeaf ? 'unmute' : 'mute')}
          >
            <MicIcon slashed={state.selfMute || state.selfDeaf} />
            <Label text={state.selfMute || state.selfDeaf ? t.unmute : t.mute} />
          </button>
          <button
            className={`ctl ${state.selfDeaf ? 'on' : ''}`}
            aria-pressed={state.selfDeaf}
            aria-label={state.selfDeaf ? t.undeafen : t.deafen}
            onClick={() => send(state.selfDeaf ? 'undeafen' : 'deafen')}
          >
            <HeadphonesIcon slashed={state.selfDeaf} />
            <Label text={state.selfDeaf ? t.undeafen : t.deafen} />
          </button>
          <button className="ctl hangup" aria-label={t.disconnect} onClick={() => send('disconnect')}>
            <HangUpIcon />
            <Label text={t.disconnect} />
          </button>
        </nav>
      ) : (
        <nav className="options">
          <button className="option" aria-label={t.connect} onClick={() => send('connect')}>
            <span className="option-cmd">{say('connect')}</span>
            <span className="option-context">{connectContext}</span>
          </button>
          <button
            className="option"
            aria-label={t.random}
            disabled={!view.randomAvailable}
            onClick={() => send('random')}
          >
            <span className="option-cmd">{say('random')}</span>
            {!view.randomAvailable && <span className="option-context">{t.notices['no-open-rooms']}</span>}
          </button>
        </nav>
      )}
    </main>
  );
}
