import type { CarProfile } from './cars';
import type { LatLng } from './geo';
import type { Command, VoiceState } from './voice';

export type Mode = 'demo' | 'live';

/** A driver in your room, as shown to phones. */
export interface RosterMember {
  id: string;
  name: string;
  color: string;
  state: VoiceState;
}

export interface RoomInfo {
  id: string;
  name: string;
  members: RosterMember[];
}

export interface LiveKitAccess {
  url: string;
  token: string;
  /** Identity of the hidden command listener; muted phones still allow it to subscribe. */
  listenerIdentity: string;
}

/** GET /api/stats: public counts for the home page. Counts only, never who or where. */
export interface PublicStats {
  /** People online and connected to a voice room (bots and disconnected drivers excluded). */
  talking: number;
}

export const STATS_PATH = '/api/stats';

// ---- phone -> server ----

export type ClientMessage =
  | {
      t: 'hello';
      clientId: string;
      mode: Mode;
      profile: CarProfile;
      /** Demo: force a jam (e.g. "hospital-curve") or "loner". */
      spot?: string;
      /** Live: current GPS position. */
      pos?: LatLng;
    }
  | { t: 'pos'; pos: LatLng }
  | { t: 'cmd'; cmd: Command };

// ---- server -> phone ----

export type CommandSource = 'voice' | 'button' | 'presenter';

export type ServerMessage =
  | { t: 'welcome'; id: string; profile: CarProfile; state: VoiceState; mode: Mode }
  /** You are (now) in this room; connect to LiveKit with this access. */
  | { t: 'assigned'; room: RoomInfo; livekit: LiveKitAccess }
  | { t: 'roster'; room: RoomInfo }
  | { t: 'state'; state: VoiceState; cmd?: Command; source?: CommandSource }
  /** The presenter reset the demo: say hello again to be placed afresh. */
  | { t: 'reset' }
  | { t: 'error'; message: string }
  /**
   * While disconnected: who "connect" would match with right now (or null, meaning
   * a new room), and whether "random" has anywhere to go. Data only — the phone
   * composes the text (i18n).
   */
  | {
      t: 'closest';
      match: { name: string; color: string; roomName: string } | null;
      randomAvailable: boolean;
    }
  /** A transient, non-fatal notice. A code, not a sentence: phones compose the text (i18n). */
  | { t: 'notice'; code: NoticeCode };

/** "random" found nowhere else open to jump to. */
export type NoticeCode = 'no-open-rooms';

// ---- projector ----

export interface CarSnapshot {
  id: string;
  name: string;
  color: string;
  pos: LatLng;
  heading: number;
  roomId: string | null;
  state: VoiceState;
  speaking: boolean;
  bot: boolean;
  mode: Mode;
  online: boolean;
}

export interface RoomSnapshot {
  id: string;
  name: string;
  memberIds: string[];
  activeCount: number;
  /** Ms left before the lone member is merged, if the room is down to one. */
  mergeInMs: number | null;
}

export interface WorldSnapshot {
  t: 'snapshot';
  now: number;
  capacity: number;
  cars: CarSnapshot[];
  rooms: RoomSnapshot[];
  /** Recent notable events for the projector ticker. */
  log: string[];
}

export type PresenterAction =
  | { t: 'admin'; action: 'reset' }
  | { t: 'admin'; action: 'spawn-loner' }
  | { t: 'admin'; action: 'mute-all' }
  | { t: 'admin'; action: 'mute-car'; carId: string };

export const WS_PATH = '/ws';
