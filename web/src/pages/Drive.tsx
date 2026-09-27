import { colorHex, isTransmitting, sayPhrase, type Command, type Lang, type RosterMember } from '@roadies/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { CarArt } from '../components/CarArt';
import {
  LineHeadphoneOff,
  LineHeadphones,
  LineMic,
  LineMicOff,
  LinePhoneOff,
  LineSettings,
  LineUsers,
  LineVolume,
} from '../components/icons';
import { unlockAudio } from '../lib/chimes';
import { capitalize, strings } from '../lib/i18n';
import type { DriveSession, SessionView } from '../lib/session';
import { settingsLink } from './YourJam';

const NOTICE_FLASH_MS = 4000;

/** A button label; a word longer than "Disconnect" ("Déconnexion") gets the smaller `long` size. */
function Label({ text }: { text: string }) {
  const long = text.split(' ').some((word) => word.length > 10);
  return <span className={`ctl-label ${long ? 'long' : ''}`}>{text}</span>;
}

interface PersonProps {
  name: string;
  /** Visible label under the circle ("You" for yourself). */
  label: string;
  color: string;
  speaking: boolean;
  muted: boolean;
  deaf: boolean;
}

/**
 * Her round avatar: a cream car on a circle in the driver's car color (the
 * same color the projector shows), a teal ring while talking, a badge while
 * muted or deafened.
 */
function Person({ name, label, color, speaking, muted, deaf }: PersonProps) {
  return (
    <li className={`person ${speaking ? 'is-speaking' : ''}`}>
      <span className="avatar-circle" style={{ background: color }}>
        <CarArt color="#fffcee" size={58} title={name} />
        {(muted || deaf) && <span className="muted-badge">{deaf ? <LineHeadphoneOff /> : <LineMicOff />}</span>}
      </span>
      <span className="person-name">{label}</span>
    </li>
  );
}

interface DriveProps {
  session: DriveSession;
  view: SessionView;
  lang: Lang;
  onSettings: () => void;
  children?: ReactNode;
}

/**
 * The voice chat (connected only; leaving it lands on Your jam): her Live tag,
 * the room's place name, a round avatar per driver, and her control bar. The
 * buttons carry the spoken command words, so the screen teaches the voice.
 */
export function Drive({ session, view, lang, onSettings, children }: DriveProps) {
  const t = strings(lang);
  const word = (cmd: Command) => capitalize(lang, sayPhrase(lang, cmd));
  const say = (cmd: Command) => t.quote(sayPhrase(lang, cmd));
  const { state, room, profile, myId } = view;
  const [now, setNow] = useState(Date.now());

  // Re-render to expire the notice flash.
  useEffect(() => {
    if (!view.notice) return;
    const timer = setTimeout(() => setNow(Date.now()), NOTICE_FLASH_MS);
    return () => clearTimeout(timer);
  }, [view.notice]);

  const members = room?.members ?? [];
  const others = members.filter((m) => m.id !== myId);
  const speaking = (id: string | null, s: RosterMember['state']) => !!id && view.speakers.includes(id) && isTransmitting(s);

  const tone = state.selfDeaf ? 'deaf' : state.selfMute ? 'muted' : 'live';
  const send = (cmd: Command) => session.command(cmd);
  const micOn = !state.selfMute && !state.selfDeaf;
  const noticeFresh = view.notice && now - view.notice.at < NOTICE_FLASH_MS ? view.notice : null;

  return (
    // Any tap re-unlocks audio: iOS suspends it after a lock screen or phone call.
    <main className="screen room" data-tone={tone} onPointerDown={unlockAudio}>
      <header className="room-top" aria-live="polite">
        <div className="room-tags">
          <span className={`live voice-status ${view.voiceConnected ? 'ok' : ''}`}>
            <span className="live-dot" aria-hidden="true" />
            {view.voiceConnected ? t.live : t.voiceConnecting}
          </span>
          {room && (
            <span className="road-tag status-sub" aria-label={t.roomCount(members.length)}>
              <LineUsers aria-hidden="true" />
              {members.length}
            </span>
          )}
          <a className="icon-btn" aria-label={t.settings} {...settingsLink(onSettings)}>
            <LineSettings />
          </a>
        </div>
        {/* Room names are place names: never translated. */}
        <h1 className="room-title status-title">{room?.name ?? t.finding}</h1>
        {tone === 'muted' && <p className="banner">{t.mutedBanner(say('unmute'))}</p>}
        {tone === 'deaf' && <p className="banner">{t.deafenedBanner(say('undeafen'))}</p>}
      </header>

      {(children || view.audioBlocked || view.error || noticeFresh) && (
        <div className="room-notices">
          {view.audioBlocked && (
            <button className="notice" onClick={() => void session.voice.startAudio()}>
              <LineVolume />
              {t.tapForSound}
            </button>
          )}
          {children}
          {view.error && <p className="notice error">{view.error}</p>}
          {noticeFresh && !view.error && <p className="notice">{t.notices[noticeFresh.code]}</p>}
        </div>
      )}

      {room && (
        <ul className="people" data-testid="avatar-grid">
          <Person
            name={profile.name}
            label={t.you}
            color={colorHex(profile.color)}
            speaking={speaking(myId, state)}
            muted={state.selfMute}
            deaf={state.selfDeaf}
          />
          {others.slice(0, 3).map((m) => (
            <Person
              key={m.id}
              name={m.name}
              label={m.name}
              color={colorHex(m.color)}
              speaking={speaking(m.id, m.state)}
              muted={m.state.selfMute}
              deaf={m.state.selfDeaf}
            />
          ))}
        </ul>
      )}

      <nav className="controls">
        <button
          className={`ctl ${micOn ? 'on' : ''}`}
          aria-pressed={state.selfMute}
          aria-label={state.selfMute || state.selfDeaf ? word('unmute') : word('mute')}
          onClick={() => send(state.selfMute || state.selfDeaf ? 'unmute' : 'mute')}
        >
          <span className="ctl-icon">{micOn ? <LineMic /> : <LineMicOff />}</span>
          <Label text={state.selfMute || state.selfDeaf ? word('unmute') : word('mute')} />
        </button>
        <button
          className={`ctl ${state.selfDeaf ? '' : 'on'}`}
          aria-pressed={state.selfDeaf}
          aria-label={state.selfDeaf ? word('undeafen') : word('deafen')}
          onClick={() => send(state.selfDeaf ? 'undeafen' : 'deafen')}
        >
          <span className="ctl-icon">{state.selfDeaf ? <LineHeadphoneOff /> : <LineHeadphones />}</span>
          <Label text={state.selfDeaf ? word('undeafen') : word('deafen')} />
        </button>
        <button className="ctl ctl-leave" aria-label={word('disconnect')} onClick={() => send('disconnect')}>
          <span className="ctl-icon">
            <LinePhoneOff />
          </span>
          <Label text={word('disconnect')} />
        </button>
      </nav>
    </main>
  );
}
