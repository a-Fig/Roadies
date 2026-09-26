import { haversineMeters, type LatLng } from './geo';

export interface MatchConfig {
  /** Max active members per room. */
  capacity: number;
  /** A lone member is merged into the nearest open room after this long. */
  aloneMergeMs: number;
}

export const MATCH_CONFIG: MatchConfig = {
  capacity: 4,
  aloneMergeMs: 15_000,
};

export interface RoomMember {
  id: string;
  pos: LatLng;
  /** False while the member is disconnected ("ghost"): kept in place, but not counted. */
  active: boolean;
}

export interface MatchRoom {
  id: string;
  name: string;
  origin: LatLng;
  createdAt: number;
  /** Insertion order is join order. */
  members: Map<string, RoomMember>;
  /** When the room dropped to exactly one active member, else null. */
  aloneSince: number | null;
}

export type JoinReason = 'closest' | 'new-room' | 'merge' | 'random' | 'reconnect';

export type MatchEvent =
  | { type: 'room-created'; roomId: string }
  | { type: 'room-deleted'; roomId: string }
  | { type: 'joined'; memberId: string; roomId: string; reason: JoinReason }
  | { type: 'left'; memberId: string; roomId: string }
  | { type: 'active-changed'; memberId: string; roomId: string; active: boolean };

export interface MatchmakerOptions {
  config?: Partial<MatchConfig>;
  /** Base name for a room founded at `pos`, e.g. "Hospital Curve". */
  namer: (pos: LatLng) => string;
  newRoomId?: () => string;
}

/**
 * Proximity matchmaking (see DESIGN.md §3). Pure and synchronous: callers pass
 * the current time, and every mutation returns the events it caused.
 */
export class Matchmaker {
  readonly config: MatchConfig;
  private readonly namer: (pos: LatLng) => string;
  private readonly newRoomId: () => string;
  private readonly rooms = new Map<string, MatchRoom>();
  private readonly memberRoom = new Map<string, string>();

  constructor(options: MatchmakerOptions) {
    this.config = { ...MATCH_CONFIG, ...options.config };
    this.namer = options.namer;
    let counter = 0;
    this.newRoomId = options.newRoomId ?? (() => `room-${++counter}`);
  }

  listRooms(): MatchRoom[] {
    return [...this.rooms.values()];
  }

  getRoom(roomId: string): MatchRoom | undefined {
    return this.rooms.get(roomId);
  }

  roomOf(memberId: string): MatchRoom | undefined {
    const roomId = this.memberRoom.get(memberId);
    return roomId === undefined ? undefined : this.rooms.get(roomId);
  }

  activeCount(room: MatchRoom): number {
    let n = 0;
    for (const m of room.members.values()) if (m.active) n++;
    return n;
  }

  /**
   * The closest active member (in any room with a free seat) to `pos`, other
   * than `memberId` itself. Used for the disconnected-screen preview and for
   * `place`/`reconnect`, so all three can never disagree.
   */
  closestOpen(memberId: string, pos: LatLng): { roomId: string; memberId: string } | null {
    let best: { roomId: string; memberId: string } | null = null;
    let bestDist = Infinity;
    for (const room of this.rooms.values()) {
      if (this.activeCount(room) >= this.config.capacity) continue;
      for (const m of room.members.values()) {
        if (!m.active || m.id === memberId) continue;
        const d = haversineMeters(m.pos, pos);
        if (d < bestDist) {
          bestDist = d;
          best = { roomId: room.id, memberId: m.id };
        }
      }
    }
    return best;
  }

  /** Put a new member into the closest active driver's room with space, at any distance, or a new room. */
  place(memberId: string, pos: LatLng, now: number): MatchEvent[] {
    if (this.memberRoom.has(memberId)) throw new Error(`${memberId} is already placed`);
    const events: MatchEvent[] = [];
    const match = this.closestOpen(memberId, pos);
    let target: MatchRoom;
    let reason: JoinReason;
    if (match) {
      target = this.rooms.get(match.roomId)!;
      reason = 'closest';
    } else {
      target = this.createRoom(pos, now);
      events.push({ type: 'room-created', roomId: target.id });
      reason = 'new-room';
    }
    this.addMember(target, { id: memberId, pos, active: true }, now);
    events.push({ type: 'joined', memberId, roomId: target.id, reason });
    return events;
  }

  updatePosition(memberId: string, pos: LatLng): void {
    const member = this.roomOf(memberId)?.members.get(memberId);
    if (member) member.pos = pos;
  }

  /** Keep the member in their room as an inactive ghost. */
  disconnect(memberId: string, now: number): MatchEvent[] {
    const room = this.roomOf(memberId);
    const member = room?.members.get(memberId);
    if (!room || !member || !member.active) return [];
    member.active = false;
    this.refreshAlone(room, now);
    return [{ type: 'active-changed', memberId, roomId: room.id, active: false }];
  }

  /**
   * Re-match to the closest active driver with a free seat, right now, using
   * the current position — same rule as `place`. If that is the current ghost
   * room, reactivate in place (no leave/join, so the phone doesn't switch
   * LiveKit rooms); otherwise leave the old room and join (or open) the new one.
   */
  reconnect(memberId: string, now: number): MatchEvent[] {
    const room = this.roomOf(memberId);
    const member = room?.members.get(memberId);
    if (!room || !member || member.active) return [];
    const match = this.closestOpen(memberId, member.pos);
    if (match && match.roomId === room.id) {
      member.active = true;
      this.refreshAlone(room, now);
      return [{ type: 'active-changed', memberId, roomId: room.id, active: true }];
    }
    const pos = member.pos;
    const events = this.remove(memberId, now);
    const target = match ? this.rooms.get(match.roomId)! : this.createRoom(pos, now);
    if (!match) events.push({ type: 'room-created', roomId: target.id });
    this.addMember(target, { id: memberId, pos, active: true }, now);
    events.push({ type: 'joined', memberId, roomId: target.id, reason: 'reconnect' });
    return events;
  }

  /**
   * While disconnected, jump to a uniformly random open room (at least one
   * active member, not full) other than the current one. Null if connected,
   * not found, or there is nowhere else open.
   */
  random(memberId: string, now: number, rng: () => number): MatchEvent[] | null {
    const room = this.roomOf(memberId);
    const member = room?.members.get(memberId);
    if (!room || !member || member.active) return null;
    const candidates = [...this.rooms.values()].filter((r) => {
      if (r.id === room.id) return false;
      const active = this.activeCount(r);
      return active > 0 && active < this.config.capacity;
    });
    if (candidates.length === 0) return null;
    const target = candidates[Math.floor(rng() * candidates.length)]!;
    const pos = member.pos;
    const events = this.remove(memberId, now);
    this.addMember(target, { id: memberId, pos, active: true }, now);
    events.push({ type: 'joined', memberId, roomId: target.id, reason: 'random' });
    return events;
  }

  /** Whether `random` has anywhere to send this member right now (excluding its own room). */
  hasRandomTarget(memberId: string): boolean {
    const room = this.roomOf(memberId);
    for (const r of this.rooms.values()) {
      if (room && r.id === room.id) continue;
      const active = this.activeCount(r);
      if (active > 0 && active < this.config.capacity) return true;
    }
    return false;
  }

  remove(memberId: string, now: number): MatchEvent[] {
    const room = this.roomOf(memberId);
    if (!room) return [];
    room.members.delete(memberId);
    this.memberRoom.delete(memberId);
    const events: MatchEvent[] = [{ type: 'left', memberId, roomId: room.id }];
    if (room.members.size === 0) {
      this.rooms.delete(room.id);
      events.push({ type: 'room-deleted', roomId: room.id });
    } else {
      this.refreshAlone(room, now);
    }
    return events;
  }

  /** Merge anyone who has been alone too long into the nearest open room, at any distance. */
  tick(now: number): MatchEvent[] {
    const events: MatchEvent[] = [];
    for (const room of [...this.rooms.values()]) {
      if (!this.rooms.has(room.id) || room.aloneSince === null) continue;
      if (now - room.aloneSince < this.config.aloneMergeMs) continue;
      const loner = [...room.members.values()].find((m) => m.active);
      if (!loner) continue;
      let target: MatchRoom | undefined;
      let targetDist = Infinity;
      for (const other of this.rooms.values()) {
        if (other === room) continue;
        const active = this.activeCount(other);
        if (active === 0 || active >= this.config.capacity) continue;
        const d = this.distanceTo(other, loner.pos, loner.id);
        if (d < targetDist) {
          target = other;
          targetDist = d;
        }
      }
      if (!target) continue;
      events.push(...this.remove(loner.id, now));
      this.addMember(target, { ...loner, active: true }, now);
      events.push({ type: 'joined', memberId: loner.id, roomId: target.id, reason: 'merge' });
    }
    return events;
  }

  /** Distance from `pos` to the nearest active member of `room` (other than `excludeId`). */
  private distanceTo(room: MatchRoom, pos: LatLng, excludeId: string): number {
    let best = Infinity;
    for (const m of room.members.values()) {
      if (!m.active || m.id === excludeId) continue;
      best = Math.min(best, haversineMeters(m.pos, pos));
    }
    return best;
  }

  private createRoom(pos: LatLng, now: number): MatchRoom {
    const base = this.namer(pos);
    const used = new Set<number>();
    for (const r of this.rooms.values()) {
      const match = /^(.*) #(\d+)$/.exec(r.name);
      if (match && match[1] === base) used.add(Number(match[2]));
    }
    let n = 1;
    while (used.has(n)) n++;
    const room: MatchRoom = {
      id: this.newRoomId(),
      name: `${base} #${n}`,
      origin: pos,
      createdAt: now,
      members: new Map(),
      aloneSince: null,
    };
    this.rooms.set(room.id, room);
    return room;
  }

  private addMember(room: MatchRoom, member: RoomMember, now: number): void {
    room.members.set(member.id, member);
    this.memberRoom.set(member.id, room.id);
    this.refreshAlone(room, now);
  }

  private refreshAlone(room: MatchRoom, now: number): void {
    if (this.activeCount(room) === 1) room.aloneSince ??= now;
    else room.aloneSince = null;
  }
}
