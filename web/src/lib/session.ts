import {
  INITIAL_VOICE_STATE,
  type CarProfile,
  type ClientMessage,
  type Command,
  type CommandSource,
  type LatLng,
  type Mode,
  type RoomInfo,
  type ServerMessage,
  type VoiceState,
} from '@roadies/shared';
import { chimes } from './chimes';
import { clientId } from './identity';
import { RoadiesSocket, type SocketStatus } from './socket';
import { VoiceClient } from './voice';

export interface SessionView {
  myId: string | null;
  profile: CarProfile;
  state: VoiceState;
  room: RoomInfo | null;
  /** LiveKit active speakers (identities), unfiltered. */
  speakers: string[];
  heard: { cmd: Command; source: CommandSource; at: number } | null;
  socket: SocketStatus;
  voiceConnected: boolean;
  audioBlocked: boolean;
  error: string | null;
}

export interface SessionOptions {
  mode: Mode;
  profile: CarProfile;
  /** Demo: force a jam, e.g. "hospital-curve" or "loner". */
  spot?: string;
  /** Live: first GPS fix. */
  pos?: LatLng;
}

/** One driver's connection: control socket + LiveKit voice + chimes. */
export class DriveSession {
  readonly voice = new VoiceClient();
  private readonly socket: RoadiesSocket<ServerMessage, ClientMessage>;
  private readonly listeners = new Set<() => void>();
  private pos: LatLng | undefined;
  private view: SessionView;

  constructor(private readonly opts: SessionOptions) {
    this.pos = opts.pos;
    this.view = {
      myId: null,
      profile: opts.profile,
      state: INITIAL_VOICE_STATE,
      room: null,
      speakers: [],
      heard: null,
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
    this.socket.send({ t: 'cmd', cmd });
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
    };
  }

  private handle(msg: ServerMessage): void {
    switch (msg.t) {
      case 'welcome':
        this.update({ myId: msg.id, profile: msg.profile, state: msg.state, error: null });
        break;
      case 'assigned': {
        const previous = this.view.room;
        if (previous && previous.id !== msg.room.id) chimes.moved();
        this.update({ room: msg.room });
        this.voice
          .join(msg.room.id, msg.livekit, this.view.state)
          .then(() => {
            if (this.view.error?.startsWith('Voice connection failed')) this.update({ error: null });
          })
          .catch((err: Error) => {
            console.error(err);
            this.update({ error: `Voice connection failed: ${err.message}` });
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
        this.update({
          state: msg.state,
          heard: msg.cmd ? { cmd: msg.cmd, source: msg.source ?? 'button', at: Date.now() } : this.view.heard,
        });
        break;
      case 'reset':
        void this.voice.leave();
        this.update({ room: null, state: INITIAL_VOICE_STATE, speakers: [], heard: null });
        this.socket.send(this.hello());
        break;
      case 'error':
        this.update({ error: msg.message });
        break;
    }
  }

  private update(patch: Partial<SessionView>): void {
    this.view = { ...this.view, ...patch };
    this.listeners.forEach((fn) => fn());
  }
}
