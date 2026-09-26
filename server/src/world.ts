import { createHash } from 'node:crypto';
import {
  applyCommand,
  INITIAL_VOICE_STATE,
  isTransmitting,
  joinState,
  Matchmaker,
  parseAlternatives,
  placeName,
  randomCar,
  type CarProfile,
  type ClientMessage,
  type Command,
  type CommandSource,
  type LatLng,
  type MatchEvent,
  type MatchRoom,
  type Mode,
  type RoomInfo,
  type ServerMessage,
  type VoiceState,
  type WorldSnapshot,
} from '@roadies/shared';
import { DemoDirector, type Motion } from './demo';

export type Send = (msg: ServerMessage) => void;
type Hello = Extract<ClientMessage, { t: 'hello' }>;

/**
 * The car id everything outside World sees (roster, snapshot, LiveKit
 * identity) — a one-way derivation of the secret clientId a phone sends in
 * `hello`, so knowing another car's id never lets you prove you own it.
 */
export function carIdFor(clientId: string): string {
  return createHash('sha256').update(clientId).digest('hex').slice(0, 16);
}

/** Hard cap on live cars, so a flood of hellos can't grow memory without bound. */
export const MAX_CARS = 150;

export interface Car {
  id: string;
  profile: CarProfile;
  mode: Mode;
  pos: LatLng;
  heading: number;
  state: VoiceState;
  bot: boolean;
  speaking: boolean;
  /** Simulated movement (demo cars and bots); null for real GPS. */
  motion: Motion | null;
  send: Send | null;
  offlineSince: number | null;
}

export interface WorldOptions {
  now?: () => number;
  rng?: () => number;
  issueToken: (identity: string, name: string, roomId: string) => Promise<string>;
  livekitUrl: string;
  listenerIdentity: string;
  /** How long a car whose socket dropped keeps its seat. */
  graceMs?: number;
  onRoomCreated?: (roomId: string) => void;
  onRoomDeleted?: (roomId: string) => void;
  onCommand?: (car: Car, cmd: Command, source: CommandSource) => void;
}

const LOG_SIZE = 8;

/**
 * All live state: cars, rooms, and voice states. No I/O of its own; the
 * WebSocket layer calls in, and messages go out through each car's `send`.
 */
export class World {
  readonly matchmaker: Matchmaker;
  readonly demo: DemoDirector;
  private readonly cars = new Map<string, Car>();
  /** The last `closest` preview sent per disconnected car (`roomId:memberId|randomAvailable`), to dedupe. */
  private readonly closestSeen = new Map<string, string>();
  private readonly log: string[] = [];
  private readonly now: () => number;
  private readonly rng: () => number;
  private readonly graceMs: number;
  private lastTick: number;
  private botCount = 0;

  constructor(private readonly opts: WorldOptions) {
    this.now = opts.now ?? Date.now;
    this.rng = opts.rng ?? Math.random;
    this.graceMs = opts.graceMs ?? 30_000;
    this.lastTick = this.now();
    let roomCounter = 0;
    const epoch = this.now().toString(36);
    this.matchmaker = new Matchmaker({
      namer: placeName,
      newRoomId: () => `rd-${epoch}-${++roomCounter}`,
    });
    this.demo = new DemoDirector(this.rng);
  }

  getCar(id: string): Car | undefined {
    return this.cars.get(id);
  }

  listCars(): Car[] {
    return [...this.cars.values()];
  }

  /** A phone said hello: resume its car, or create and place a new one. */
  hello(msg: Hello, send: Send): void {
    // A hex-derived id can never equal this, but reject it explicitly anyway
    // so nobody can reason their way into the hidden listener's identity.
    if (msg.clientId === this.opts.listenerIdentity) {
      send({ t: 'error', message: 'That id is reserved.' });
      return;
    }

    const now = this.now();
    const id = carIdFor(msg.clientId);
    const existing = this.cars.get(id);
    if (existing) {
      existing.send = send;
      existing.offlineSince = null;
      send({ t: 'welcome', id: existing.id, profile: existing.profile, state: existing.state, mode: existing.mode });
      const room = this.matchmaker.roomOf(existing.id);
      if (room) void this.sendAssigned(existing, room);
      // A reload while ghosted shouldn't sit blank until the next tick.
      if (!existing.state.connected) this.sendClosestPreview(existing.id);
      return;
    }

    if (this.cars.size >= MAX_CARS) {
      send({ t: 'error', message: 'Roadies is full right now — try again later.' });
      return;
    }

    let pos: LatLng;
    let heading = 0;
    let motion: Motion | null = null;
    if (msg.mode === 'demo') {
      motion = this.demo.initialMotion(this.demo.nextSpot(msg.spot));
      ({ pos, heading } = this.demo.position(motion));
    } else {
      if (!msg.pos) {
        send({ t: 'error', message: 'Live mode needs a GPS position.' });
        return;
      }
      pos = msg.pos;
    }

    const car: Car = {
      id,
      profile: sanitizeProfile(msg.profile, this.rng),
      mode: msg.mode,
      pos,
      heading,
      state: joinState(msg.mode),
      bot: false,
      speaking: false,
      motion,
      send,
      offlineSince: null,
    };
    this.cars.set(car.id, car);
    send({ t: 'welcome', id: car.id, profile: car.profile, state: car.state, mode: car.mode });
    this.handle(this.matchmaker.place(car.id, pos, now));
  }

  /** Live-mode GPS update. */
  position(carId: string, pos: LatLng): void {
    const car = this.cars.get(carId);
    if (!car || car.mode !== 'live') return;
    car.pos = pos;
    this.matchmaker.updatePosition(carId, pos);
  }

  /** A final transcript from the command listener (one string, or an n-best list). */
  transcript(carId: string, heard: string | readonly string[]): Command | null {
    const cmd = parseAlternatives(typeof heard === 'string' ? [heard] : heard);
    if (cmd) this.command(carId, cmd, 'voice');
    return cmd;
  }

  command(carId: string, cmd: Command, source: CommandSource): void {
    const car = this.cars.get(carId);
    if (!car) return;
    const before = car.state;

    if (cmd === 'random') {
      // Only meaningful while disconnected; otherwise fully ignored (no state
      // change, no log — DESIGN.md §3/§4).
      if (before.connected) return;
      const now = this.now();
      const events = this.matchmaker.random(carId, now, this.rng);
      if (!events) {
        car.send?.({ t: 'notice', code: 'no-open-rooms' });
        return;
      }
      car.state = applyCommand(before, cmd);
      car.send?.({ t: 'state', state: car.state, cmd, source });
      this.opts.onCommand?.(car, cmd, source);
      if (source === 'voice') this.addLog(`🗣️ ${car.profile.name}: “${cmd}”`);
      this.handle(events);
      this.closestSeen.delete(carId);
      return;
    }

    car.state = applyCommand(before, cmd);
    car.send?.({ t: 'state', state: car.state, cmd, source });
    this.opts.onCommand?.(car, cmd, source);
    if (source === 'voice') this.addLog(`🗣️ ${car.profile.name}: “${cmd}”`);

    const now = this.now();
    if (cmd === 'disconnect' && before.connected) {
      this.handle(this.matchmaker.disconnect(carId, now));
      this.sendClosestPreview(carId);
    } else if (cmd === 'connect' && !before.connected) {
      this.handle(this.matchmaker.reconnect(carId, now));
      this.closestSeen.delete(carId);
    } else {
      const room = this.matchmaker.roomOf(carId);
      if (room) this.broadcastRoster(room);
    }
  }

  /** The phone's socket closed. Keep its seat for a grace period. */
  disconnected(carId: string, send: Send): void {
    const car = this.cars.get(carId);
    if (!car || car.send !== send) return; // replaced by a newer socket
    car.send = null;
    car.offlineSince = this.now();
  }

  /** Called by the listener when LiveKit's active speakers change. */
  setSpeakers(roomId: string, identities: readonly string[]): void {
    const room = this.matchmaker.getRoom(roomId);
    if (!room) return;
    const speaking = new Set(identities);
    for (const id of room.members.keys()) {
      const car = this.cars.get(id);
      if (car) car.speaking = speaking.has(id) && isTransmitting(car.state);
    }
  }

  tick(): void {
    const now = this.now();
    const dt = now - this.lastTick;
    this.lastTick = now;
    for (const car of this.cars.values()) {
      if (car.motion) {
        this.demo.step(car.motion, dt, now);
        ({ pos: car.pos, heading: car.heading } = this.demo.position(car.motion));
        this.matchmaker.updatePosition(car.id, car.pos);
      }
      if (car.offlineSince !== null && now - car.offlineSince >= this.graceMs) {
        this.removeCar(car.id);
        continue;
      }
      if (!car.state.connected) this.sendClosestPreview(car.id);
      else this.closestSeen.delete(car.id);
    }
    this.handle(this.matchmaker.tick(now));
  }

  // ---- presenter controls ----

  reset(): void {
    for (const car of [...this.cars.values()]) {
      car.send?.({ t: 'reset' });
      this.removeCar(car.id);
    }
    this.demo.reset();
    this.log.length = 0;
    this.addLog('🔄 Demo reset');
  }

  spawnLoner(): Car {
    const motion = this.demo.initialMotion({ kind: 'loner' });
    const { pos, heading } = this.demo.position(motion);
    const car: Car = {
      id: `bot-${++this.botCount}`,
      profile: randomCar(this.rng),
      mode: 'demo',
      pos,
      heading,
      state: { ...INITIAL_VOICE_STATE },
      bot: true,
      speaking: false,
      motion,
      send: null,
      offlineSince: null,
    };
    this.cars.set(car.id, car);
    this.addLog(`🚗 Lone commuter ${car.profile.name} near ${placeName(pos)}`);
    this.handle(this.matchmaker.place(car.id, pos, this.now()));
    return car;
  }

  muteAll(): void {
    for (const car of this.cars.values()) {
      if (!car.state.selfMute) this.command(car.id, 'mute', 'presenter');
    }
    this.addLog('🔇 Presenter muted everyone');
  }

  snapshot(): WorldSnapshot {
    const now = this.now();
    return {
      t: 'snapshot',
      now,
      capacity: this.matchmaker.config.capacity,
      cars: this.listCars().map((c) => ({
        id: c.id,
        name: c.profile.name,
        color: c.profile.color,
        pos: c.pos,
        heading: c.heading,
        roomId: this.matchmaker.roomOf(c.id)?.id ?? null,
        state: c.state,
        speaking: c.speaking,
        bot: c.bot,
        mode: c.mode,
        online: c.bot || c.send !== null,
      })),
      rooms: this.matchmaker.listRooms().map((r) => ({
        id: r.id,
        name: r.name,
        memberIds: [...r.members.keys()],
        activeCount: this.matchmaker.activeCount(r),
        mergeInMs:
          r.aloneSince === null
            ? null
            : Math.max(0, this.matchmaker.config.aloneMergeMs - (now - r.aloneSince)),
      })),
      log: [...this.log],
    };
  }

  roomInfo(room: MatchRoom): RoomInfo {
    const members = [...room.members.values()]
      .filter((m) => m.active)
      .map((m) => this.cars.get(m.id))
      .filter((c): c is Car => c !== undefined)
      .map((c) => ({ id: c.id, name: c.profile.name, color: c.profile.color, state: c.state }));
    return { id: room.id, name: room.name, members };
  }

  // ---- internals ----

  private removeCar(carId: string): void {
    this.cars.delete(carId);
    this.closestSeen.delete(carId);
    this.handle(this.matchmaker.remove(carId, this.now()));
  }

  /**
   * Tell a disconnected car who `connect` would match with right now (or null,
   * meaning it would start a new room) and whether `random` has anywhere to
   * go — same computation as `reconnect`/`random`, so they can never disagree.
   * Only sends when the driver id or room id actually changed.
   */
  private sendClosestPreview(carId: string): void {
    const car = this.cars.get(carId);
    if (!car) return;
    const match = this.matchmaker.closestOpen(carId, car.pos);
    const key = match ? `${match.roomId}:${match.memberId}` : null;
    const randomAvailable = this.matchmaker.hasRandomTarget(carId);
    const dedupeKey = `${key}|${randomAvailable}`;
    if (this.closestSeen.get(carId) === dedupeKey) return;
    this.closestSeen.set(carId, dedupeKey);
    const other = match ? this.cars.get(match.memberId) : undefined;
    const room = match ? this.matchmaker.getRoom(match.roomId) : undefined;
    car.send?.({
      t: 'closest',
      match: other && room ? { name: other.profile.name, color: other.profile.color, roomName: room.name } : null,
      randomAvailable,
    });
  }

  private handle(events: MatchEvent[]): void {
    const rosterRooms = new Set<string>();
    for (const e of events) {
      switch (e.type) {
        case 'room-created':
          this.opts.onRoomCreated?.(e.roomId);
          break;
        case 'room-deleted':
          this.opts.onRoomDeleted?.(e.roomId);
          rosterRooms.delete(e.roomId);
          break;
        case 'joined': {
          const car = this.cars.get(e.memberId);
          const room = this.matchmaker.getRoom(e.roomId);
          if (car && room) {
            void this.sendAssigned(car, room);
            if (e.reason === 'merge') this.addLog(`🔀 ${car.profile.name} was alone → merged into ${room.name}`);
            else if (e.reason === 'new-room') this.addLog(`🆕 ${car.profile.name} opened ${room.name}`);
            else if (e.reason === 'random') this.addLog(`🎲 ${car.profile.name} jumped to ${room.name}`);
            else if (e.reason === 'reconnect') this.addLog(`🔌 ${car.profile.name} reconnected → ${room.name}`);
            else this.addLog(`➕ ${car.profile.name} joined ${room.name}`);
          }
          rosterRooms.add(e.roomId);
          break;
        }
        case 'left':
        case 'active-changed':
          if (this.matchmaker.getRoom(e.roomId)) rosterRooms.add(e.roomId);
          break;
      }
    }
    for (const roomId of rosterRooms) {
      const room = this.matchmaker.getRoom(roomId);
      if (room) this.broadcastRoster(room);
    }
  }

  private broadcastRoster(room: MatchRoom): void {
    const info = this.roomInfo(room);
    for (const id of room.members.keys()) this.cars.get(id)?.send?.({ t: 'roster', room: info });
  }

  private async sendAssigned(car: Car, room: MatchRoom): Promise<void> {
    if (car.bot) return;
    const token = await this.opts.issueToken(car.id, car.profile.name, room.id);
    // The car may have moved again, or left, while the token was being signed.
    if (this.cars.get(car.id) !== car || this.matchmaker.roomOf(car.id) !== room) return;
    car.send?.({
      t: 'assigned',
      room: this.roomInfo(room),
      livekit: { url: this.opts.livekitUrl, token, listenerIdentity: this.opts.listenerIdentity },
    });
  }

  private addLog(line: string): void {
    this.log.unshift(line);
    this.log.length = Math.min(this.log.length, LOG_SIZE);
  }
}

function sanitizeProfile(p: CarProfile, rng: () => number): CarProfile {
  // Allow-list: letters (any script), digits, spaces, simple punctuation.
  // Markup and emoji both fall outside this set, so both are stripped.
  const clean = (s: unknown, max: number) =>
    typeof s === 'string' ? s.replace(/[^\p{L}\p{N} '.\-_!]/gu, '').trim().slice(0, max) : '';
  const make = clean(p?.make, 24) || 'Car';
  const color = clean(p?.color, 16) || 'Silver';
  const name = clean(p?.name, 32) || randomCar(rng).name;
  return { name, make, color };
}
