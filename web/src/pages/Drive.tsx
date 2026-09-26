import { colorHex, isTransmitting, type Command } from '@roadies/shared';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { CarIcon, HangUpIcon, HeadphonesIcon, MicIcon, PhoneIcon, SpeakerIcon } from '../components/icons';
import type { DriveSession } from '../lib/session';
import { keepScreenOn } from '../lib/wakelock';

const HEARD_FLASH_MS = 2500;

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

  const members = room?.members ?? [];
  const others = members.filter((m) => m.id !== myId);
  const talking = others.filter((m) => view.speakers.includes(m.id) && isTransmitting(m.state));
  const meTalking = !!myId && view.speakers.includes(myId) && isTransmitting(state);

  const tone = !state.connected ? 'off' : state.selfDeaf ? 'deaf' : state.selfMute ? 'muted' : 'live';
  const send = (cmd: Command) => session.command(cmd);

  let title: string;
  let subtitle: string;
  if (!state.connected) {
    title = 'Disconnected';
    subtitle = 'Listening for “connect”';
  } else if (!room) {
    title = 'Finding your jam…';
    subtitle = view.socket === 'open' ? 'Matching you with nearby drivers' : 'Connecting to Roadies';
  } else {
    title = room.name;
    subtitle =
      members.length <= 1 ? 'Just you so far — we’ll find you company' : `${members.length} roadies in this room`;
  }

  let talkLine: string;
  if (!state.connected) talkLine = 'Say “connect” to rejoin';
  else if (talking.length > 0) talkLine = `${talking.map((m) => m.name).join(', ')} ${talking.length > 1 ? 'are' : 'is'} talking`;
  else if (meTalking) talkLine = 'You’re on the air';
  else if (state.selfDeaf) talkLine = 'You can’t hear the room';
  else talkLine = 'Quiet road';

  const heardFresh = view.heard && now - view.heard.at < HEARD_FLASH_MS ? view.heard : null;
  const hint = heardFresh
    ? heardFresh.source === 'presenter'
      ? `The presenter used “${heardFresh.cmd}”`
      : `✓ Heard “${heardFresh.cmd}”`
    : state.connected
      ? 'Say: mute · unmute · deafen · undeafen · disconnect'
      : 'Say: connect';

  return (
    <main className="drive" data-tone={tone}>
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

      <p className={`hint ${heardFresh ? 'flash' : ''}`} data-testid="hint">
        {hint}
      </p>

      <nav className="controls">
        <button
          className={`ctl ${state.selfMute || state.selfDeaf ? 'on' : ''}`}
          aria-pressed={state.selfMute}
          aria-label={state.selfMute ? 'Unmute' : 'Mute'}
          disabled={!state.connected}
          onClick={() => send(state.selfMute || state.selfDeaf ? 'unmute' : 'mute')}
        >
          <MicIcon slashed={state.selfMute || state.selfDeaf} />
          <span>{state.selfMute || state.selfDeaf ? 'Unmute' : 'Mute'}</span>
        </button>
        <button
          className={`ctl ${state.selfDeaf ? 'on' : ''}`}
          aria-pressed={state.selfDeaf}
          aria-label={state.selfDeaf ? 'Undeafen' : 'Deafen'}
          disabled={!state.connected}
          onClick={() => send(state.selfDeaf ? 'undeafen' : 'deafen')}
        >
          <HeadphonesIcon slashed={state.selfDeaf} />
          <span>{state.selfDeaf ? 'Undeafen' : 'Deafen'}</span>
        </button>
        {state.connected ? (
          <button className="ctl hangup" aria-label="Disconnect" onClick={() => send('disconnect')}>
            <HangUpIcon />
            <span>Disconnect</span>
          </button>
        ) : (
          <button className="ctl connect" aria-label="Connect" onClick={() => send('connect')}>
            <PhoneIcon />
            <span>Connect</span>
          </button>
        )}
      </nav>
    </main>
  );
}
