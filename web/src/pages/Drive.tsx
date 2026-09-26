import { colorHex, isTransmitting, sayPhrase, type Command, type Lang } from '@roadies/shared';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { CarIcon, HangUpIcon, HeadphonesIcon, MicIcon, PhoneIcon, ShuffleIcon, SpeakerIcon } from '../components/icons';
import { unlockAudio } from '../lib/chimes';
import { strings } from '../lib/i18n';
import type { DriveSession } from '../lib/session';
import { keepScreenOn } from '../lib/wakelock';

const HEARD_FLASH_MS = 2500;
const NOTICE_FLASH_MS = 4000;

/** What the hint strip tells you to say: mute/etc while connected, connect/random while not. */
const HINTED: Command[] = ['mute', 'unmute', 'deafen', 'undeafen', 'disconnect'];
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
    // Room names are place names: never translated.
    title = room.name;
    subtitle = members.length <= 1 ? t.justYou : t.roomCount(members.length);
  }

  let talkLine: string;
  if (!state.connected) talkLine = t.sayToRejoin(`${say('connect')} ${t.or} ${say('random')}`);
  else if (talking.length > 0) talkLine = t.talking(talking.map((m) => m.name));
  else if (meTalking) talkLine = t.onAir;
  else if (state.selfDeaf) talkLine = t.cantHear;
  else talkLine = t.quiet;

  const heardFresh = view.heard && now - view.heard.at < HEARD_FLASH_MS ? view.heard : null;
  const noticeFresh = view.notice && now - view.notice.at < NOTICE_FLASH_MS ? view.notice : null;
  const hint = heardFresh
    ? heardFresh.source === 'presenter'
      ? t.presenterUsed(say(heardFresh.cmd))
      : t.heard(say(heardFresh.cmd))
    : `${t.say} ${(state.connected ? HINTED : HINTED_DISCONNECTED).map((cmd) => sayPhrase(lang, cmd)).join(' · ')}`;

  return (
    // Any tap re-unlocks audio: iOS suspends it after a lock screen or phone call.
    <main className="drive" data-tone={tone} onPointerDown={unlockAudio}>
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
        <p className={`talking ${talking.length || meTalking ? 'on' : ''}`} data-testid="talking">
          <span className="talking-dot" aria-hidden="true" />
          {talkLine}
        </p>
        {tone === 'muted' && <p className="banner">{t.mutedBanner(say('unmute'))}</p>}
        {tone === 'deaf' && <p className="banner">{t.deafenedBanner(say('undeafen'))}</p>}
      </section>

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
          <button className="option connect" aria-label={t.connect} onClick={() => send('connect')}>
            <span className="option-cmd">
              <PhoneIcon />
              {say('connect')}
            </span>
            <span className="option-context">{connectContext}</span>
          </button>
          <button
            className="option random"
            aria-label={t.random}
            disabled={!view.randomAvailable}
            onClick={() => send('random')}
          >
            <span className="option-cmd">
              <ShuffleIcon />
              {say('random')}
            </span>
            {!view.randomAvailable && <span className="option-context">{t.notices['no-open-rooms']}</span>}
          </button>
        </nav>
      )}
    </main>
  );
}
