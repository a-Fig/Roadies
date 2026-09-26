import { colorHex, isTransmitting, type Command, type NoticeCode } from '@roadies/shared';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { CarIcon, HangUpIcon, HeadphonesIcon, MicIcon, PhoneIcon, ShuffleIcon, SpeakerIcon } from '../components/icons';
import { unlockAudio } from '../lib/chimes';
import type { DriveSession } from '../lib/session';
import { keepScreenOn } from '../lib/wakelock';

const HEARD_FLASH_MS = 2500;
const NOTICE_FLASH_MS = 4000;

// Phone-facing copy for the disconnected-screen cards and server notices, kept together
// here for the i18n pass. The server sends data (driver name/color, room name, whether
// "random" has anywhere to go, or a notice code) and this component composes the text.
const NOTICE_TEXT: Record<NoticeCode, string> = {
  'no-open-rooms': 'No other rooms open right now',
};

/** Glanceable driving mode: one status line, giant buttons, voice commands. */
export function Drive({ session }: { session: DriveSession }) {
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
  const closest = view.closest;
  const connectContext = !closest
    ? 'You’ll start a new room'
    : room && closest.roomName === room.name
      ? `Back to ${closest.roomName}`
      : `${closest.name} · ${closest.roomName}`;

  let title: string;
  let subtitle: string;
  if (!state.connected) {
    title = 'Disconnected';
    subtitle = 'Listening for “connect” or “random”';
  } else if (!room) {
    title = 'Finding your jam…';
    subtitle = view.socket === 'open' ? 'Matching you with nearby drivers' : 'Connecting to Roadies';
  } else {
    title = room.name;
    subtitle =
      members.length <= 1 ? 'Just you so far — we’ll find you company' : `${members.length} roadies in this room`;
  }

  let talkLine: string;
  if (!state.connected) talkLine = 'Say “connect” or “random” to rejoin';
  else if (talking.length > 0) talkLine = `${talking.map((m) => m.name).join(', ')} ${talking.length > 1 ? 'are' : 'is'} talking`;
  else if (meTalking) talkLine = 'You’re on the air';
  else if (state.selfDeaf) talkLine = 'You can’t hear the room';
  else talkLine = 'Quiet road';

  const heardFresh = view.heard && now - view.heard.at < HEARD_FLASH_MS ? view.heard : null;
  const noticeFresh = view.notice && now - view.notice.at < NOTICE_FLASH_MS ? view.notice : null;
  const hint = heardFresh
    ? heardFresh.source === 'presenter'
      ? `The presenter used “${heardFresh.cmd}”`
      : `✓ Heard “${heardFresh.cmd}”`
    : state.connected
      ? 'Say: mute · unmute · deafen · undeafen · disconnect'
      : 'Say: connect · random';

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
          {!state.connected ? 'Voice Disconnected' : view.voiceConnected ? 'Voice Connected' : 'Connecting voice…'}
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
        {tone === 'muted' && <p className="banner">MUTED · say “unmute”</p>}
        {tone === 'deaf' && <p className="banner">DEAFENED · say “undeafen”</p>}
      </section>

      {view.audioBlocked && state.connected && (
        <button className="notice" onClick={() => void session.voice.startAudio()}>
          🔈 Tap to turn on sound
        </button>
      )}
      {wasHidden && (
        <button className="notice" onClick={() => setWasHidden(false)}>
          Keep Roadies on screen — phones pause voice when the browser is in the background. <u>OK</u>
        </button>
      )}
      {view.error && <p className="notice error">{view.error}</p>}
      {noticeFresh && !view.error && <p className="notice">{NOTICE_TEXT[noticeFresh.code]}</p>}

      <p className={`hint ${heardFresh ? 'flash' : ''}`} data-testid="hint">
        {hint}
      </p>

      {state.connected ? (
        <nav className="controls">
          <button
            className={`ctl ${state.selfMute || state.selfDeaf ? 'on' : ''}`}
            aria-pressed={state.selfMute}
            aria-label={state.selfMute ? 'Unmute' : 'Mute'}
            onClick={() => send(state.selfMute || state.selfDeaf ? 'unmute' : 'mute')}
          >
            <MicIcon slashed={state.selfMute || state.selfDeaf} />
            <span>{state.selfMute || state.selfDeaf ? 'Unmute' : 'Mute'}</span>
          </button>
          <button
            className={`ctl ${state.selfDeaf ? 'on' : ''}`}
            aria-pressed={state.selfDeaf}
            aria-label={state.selfDeaf ? 'Undeafen' : 'Deafen'}
            onClick={() => send(state.selfDeaf ? 'undeafen' : 'deafen')}
          >
            <HeadphonesIcon slashed={state.selfDeaf} />
            <span>{state.selfDeaf ? 'Undeafen' : 'Deafen'}</span>
          </button>
          <button className="ctl hangup" aria-label="Disconnect" onClick={() => send('disconnect')}>
            <HangUpIcon />
            <span>Disconnect</span>
          </button>
        </nav>
      ) : (
        <nav className="options">
          <button className="option connect" aria-label="Connect" onClick={() => send('connect')}>
            <span className="option-cmd">
              <PhoneIcon />
              “connect”
            </span>
            <span className="option-desc">Join the closest driver</span>
            <span className="option-context">{connectContext}</span>
          </button>
          <button
            className="option random"
            aria-label="Random"
            disabled={!view.randomAvailable}
            onClick={() => send('random')}
          >
            <span className="option-cmd">
              <ShuffleIcon />
              “random”
            </span>
            <span className="option-desc">Jump into any open room, anywhere</span>
            {!view.randomAvailable && <span className="option-context">{NOTICE_TEXT['no-open-rooms']}</span>}
          </button>
        </nav>
      )}
    </main>
  );
}
