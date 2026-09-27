import {
  joinState,
  type CarProfile,
  type ClientMessage,
  type Command,
  type Lang,
  type LatLng,
  type Mode,
  type NoticeCode,
  type RoomInfo,
  type ServerMessage,
  type VoiceState,
} from '@roadies/shared';
import { chimes } from './chimes';
import { strings } from './i18n';
import { clientId } from './identity';
import { RoadiesSocket, type SocketStatus } from './socket';
import { VoiceClient } from './voice';

export interface SessionView {
  myId: string | null;
  profile: CarProfile;
  state: VoiceState;
  room: RoomInfo | null;
  /** While disconnected: who "connect" would match with right now, or null for a new room. */
  closest: { name: string; color: string; roomName: string } | null;
  /** A transient, non-fatal notice from the server (e.g. "random" had nowhere to go). */
  notice: { code: NoticeCode; at: number } | null;
  /** LiveKit active speakers (identities), unfiltered. */
  speakers: string[];
  socket: SocketStatus;
  voiceConnected: boolean;
  audioBlocked: boolean;
  error: string | null;
}

export interface SessionOptions {
  mode: Mode;
  /** UI language, and the language the server hears voice commands in. */
  lang: Lang;
  profile: CarProfile;
  /** Demo: force a jam, e.g. "hospital-curve" or "loner". */
  spot?: string;
  /** Live: first GPS fix. */
  pos?: LatLng;
  /** First join only: seat in a uniformly random open room ("random" card) instead of closest-first. */
  join?: 'random';
}

/** One driver's connection: control socket + LiveKit voice + chimes. */
export class DriveSession {
  readonly voice = new VoiceClient();
  private readonly socket: RoadiesSocket<ServerMessage, ClientMessage>;
  private readonly listeners = new Set<() => void>();
  private pos: LatLng | undefined;
  private view: SessionView;
  /**
   * A `connect`/`random` we just sent, awaiting the `assigned` it causes (the
   * server now sends `assigned` before `state` for a move — see world.ts). The
   * `state` handler already plays the right chime for it (`user_join` /
   * `user_moved`); this just tells the `assigned` handler not to *also* play
   * `moved()` for the same move.
   */
  private pendingMove: Command | null = null;
  /** The error shown for the last failed voice join, cleared once voice connects. */
  private voiceError: string | null = null;

  constructor(private opts: SessionOptions) {
    this.pos = opts.pos;
    this.view = {
      myId: null,
      profile: opts.profile,
      // What the server will send in its welcome, so a demo phone never flashes "live".
      state: joinState(opts.mode),
      room: null,
      closest: null,
      notice: null,
      speakers: [],
      socket: 'connecting',
      voiceConnected: false,
      audioBlocked: false,
      error: null,
    };
    this.socket = new RoadiesSocket<ServerMessage, ClientMessage>({
      onOpen: () => this.socket.send(this.hello()),
      onMessage: (msg) => this.handle(msg),
      onStatus: (socket) => this.update({ socket }),
    });
    this.voice.onSpeakers = (speakers) => this.update({ speakers });
    this.voice.onConnection = (s) => this.update({ voiceConnected: s === 'connected' });
    this.voice.onAudioBlocked = (audioBlocked) => this.update({ audioBlocked });
  }

  // ---- React glue (useSyncExternalStore) ----
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getView = () => this.view;

  start(): void {
    this.socket.start();
  }

  async stop(): Promise<void> {
    this.socket.stop();
    await this.voice.close();
  }

  command(cmd: Command): void {
    if (cmd === 'connect' || cmd === 'random') this.pendingMove = cmd;
    this.socket.send({ t: 'cmd', cmd });
  }

  /**
   * In-app Settings changed the car or language mid-session: say hello again.
   * The server treats it as a returning phone (same clientId, so same car,
   * room and voice state), renames the car in the roster and hears commands in
   * the new language; the resent `assigned` for the same room is a no-op for
   * LiveKit. No protocol change.
   */
  updateIdentity(profile: CarProfile, lang: Lang): void {
    this.opts = { ...this.opts, profile, lang };
    this.update({ profile });
    this.socket.send(this.hello());
  }

  updatePosition(pos: LatLng): void {
    this.pos = pos;
    this.socket.send({ t: 'pos', pos });
  }

  private hello(): ClientMessage {
    return {
      t: 'hello',
      clientId: clientId(this.opts.mode),
      mode: this.opts.mode,
      profile: this.opts.profile,
      spot: this.opts.spot,
      pos: this.pos,
      lang: this.opts.lang,
      join: this.opts.join,
    };
  }

  private handle(msg: ServerMessage): void {
    switch (msg.t) {
      case 'welcome':
        this.update({ myId: msg.id, profile: msg.profile, state: msg.state, error: null });
        break;
      case 'assigned': {
        const previous = this.view.room;
        // A self-initiated connect/random gets exactly one chime, played by
        // the `state` handler below (user_join / user_moved) — don't also
        // play the passive-move `moved()` sound for the same room switch.
        if (previous && previous.id !== msg.room.id && !this.pendingMove) chimes.moved();
        this.pendingMove = null;
        this.update({ room: msg.room });
        this.voice
          .join(msg.room.id, msg.livekit, this.view.state)
          .then(() => {
            if (this.voiceError !== null && this.view.error === this.voiceError) this.update({ error: null });
            this.voiceError = null;
          })
          .catch((err: Error) => {
            console.error(err);
            this.voiceError = `${strings(this.opts.lang).voiceFailed}: ${err.message}`;
            this.update({ error: this.voiceError });
          });
        break;
      }
      case 'roster': {
        const previous = this.view.room;
        if (!previous || previous.id !== msg.room.id) break;
        const before = new Set(previous.members.map((m) => m.id));
        const after = new Set(msg.room.members.map((m) => m.id));
        const others = (s: Set<string>) => [...s].filter((id) => id !== this.view.myId);
        if (this.view.state.connected) {
          if (others(after).some((id) => !before.has(id))) chimes.join();
          else if (others(before).some((id) => !after.has(id))) chimes.leave();
        }
        this.update({ room: msg.room });
        break;
      }
      case 'state':
        this.voice.apply(msg.state);
        if (msg.cmd) chimes[msg.cmd]();
        // No on-screen "heard" confirmation for any source (owner, 2026-09-26):
        // the state change plus the Discord sound is the whole feedback.
        this.update({ state: msg.state });
        break;
      case 'reset':
        void this.voice.leave();
        this.update({
          room: null,
          state: joinState(this.opts.mode),
          speakers: [],
          closest: null,
          notice: null,
        });
        this.socket.send(this.hello());
        break;
      case 'error':
        this.update({ error: msg.message });
        break;
      case 'closest':
        this.update({ closest: msg.match });
        break;
      case 'notice':
        this.update({ notice: { code: msg.code, at: Date.now() } });
        break;
    }
  }

  private update(patch: Partial<SessionView>): void {
    this.view = { ...this.view, ...patch };
    this.listeners.forEach((fn) => fn());
  }
}
