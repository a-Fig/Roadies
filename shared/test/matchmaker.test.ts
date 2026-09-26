import { describe, expect, it } from 'vitest';
import type { LatLng } from '../src/geo';
import { Matchmaker, type MatchEvent } from '../src/matchmaker';

const BASE: LatLng = { lat: 37.5, lng: -122.2 };
/** A point `km` north of BASE. */
const at = (km: number): LatLng => ({ lat: BASE.lat + km / 111.195, lng: BASE.lng });

const make = (capacity = 4) => new Matchmaker({ namer: () => 'Test', config: { capacity } });

const joinedRoom = (events: MatchEvent[]) => {
  const e = events.find((x) => x.type === 'joined');
  if (!e || e.type !== 'joined') throw new Error('no joined event');
  return e;
};

// Since placing joins the closest room with space at ANY distance, the only way
// to get two simultaneously-open rooms in these tests is to fill one to capacity
// (forcing a genuinely new room to open), then free a seat afterward without
// dropping activeCount to exactly 1 (which would itself start the alone timer).

describe('Matchmaker.place', () => {
  it('starts a new named room for the first driver', () => {
    const mm = make();
    const events = mm.place('a', at(0), 0);
    expect(events.map((e) => e.type)).toEqual(['room-created', 'joined']);
    expect(joinedRoom(events).reason).toBe('new-room');
    expect(mm.roomOf('a')?.name).toBe('Test #1');
  });

  it('joins the closest active driver open room, at any distance', () => {
    const mm = make();
    mm.place('a', at(0), 0);
    const e = joinedRoom(mm.place('b', at(500), 0)); // hundreds of km away
    expect(e.reason).toBe('closest');
    expect(mm.roomOf('b')).toBe(mm.roomOf('a'));
  });

  it('opens a new room when the only room with a nearby member is full', () => {
    const mm = make(2);
    mm.place('a1', at(0), 0);
    mm.place('a2', at(0.1), 0); // room full (2/2)
    const e = joinedRoom(mm.place('b', at(0.2), 0)); // very close, but nowhere to sit
    expect(e.reason).toBe('new-room');
    expect(mm.roomOf('b')).not.toBe(mm.roomOf('a1'));
  });

  it('opens a new room when every existing room is full', () => {
    const mm = make(2);
    mm.place('a1', at(0), 0);
    mm.place('a2', at(0.1), 0); // room1 full
    mm.place('b1', at(1000), 0); // room1 full -> room2
    mm.place('b2', at(1000.1), 0); // room2 full
    const e = joinedRoom(mm.place('c', at(500), 0));
    expect(e.reason).toBe('new-room');
    expect(mm.listRooms()).toHaveLength(3);
  });

  it('picks the closest of several open rooms, at any distance', () => {
    const mm = make(3);
    mm.place('a1', at(0), 0);
    mm.place('a2', at(0.1), 0);
    mm.place('a3', at(0.2), 0); // room1 full (3/3)
    mm.place('b1', at(1000), 0); // room1 full -> room2
    mm.place('b2', at(1000.1), 0);
    mm.place('b3', at(1000.2), 0); // room2 full (3/3)
    mm.remove('a3', 0); // free a seat in room1 (still 2 active)
    mm.remove('b3', 0); // free a seat in room2 (still 2 active)
    const e = joinedRoom(mm.place('c', at(1000.15), 0)); // much closer to room2
    expect(e.reason).toBe('closest');
    expect(mm.roomOf('c')).toBe(mm.roomOf('b1'));
  });

  it('caps rooms at 4 and opens a new room for the 5th', () => {
    const mm = make();
    for (let i = 0; i < 5; i++) mm.place(`p${i}`, at(i * 0.1), 0);
    const first = mm.roomOf('p0')!;
    expect(mm.activeCount(first)).toBe(4);
    expect(mm.roomOf('p4')).not.toBe(first);
    expect(mm.roomOf('p4')?.name).toBe('Test #2');
  });

  it('refuses to place the same driver twice', () => {
    const mm = make();
    mm.place('a', at(0), 0);
    expect(() => mm.place('a', at(0), 0)).toThrow();
  });
});

describe('Matchmaker.closestOpen', () => {
  it('returns null when there is nowhere open', () => {
    const mm = make();
    expect(mm.closestOpen('anyone', at(0))).toBeNull();
  });

  it('excludes the given member and full rooms', () => {
    const mm = make(2);
    mm.place('a1', at(0), 0);
    mm.place('a2', at(0.1), 0); // full, excluded regardless of distance
    mm.place('b', at(1000), 0); // open
    const match = mm.closestOpen('a1', at(0.05));
    expect(match).toEqual({ roomId: mm.roomOf('b')!.id, memberId: 'b' });
  });

  it('agrees with what reconnect actually does', () => {
    const mm = make(2);
    mm.place('a', at(0), 0);
    mm.place('b', at(0.1), 0); // room1 full
    mm.disconnect('b', 0);
    mm.place('x', at(0.15), 0); // refill room1 -> full again
    mm.place('c', at(1000), 0); // opens room2, still has space

    const ghostPos = mm.roomOf('b')!.members.get('b')!.pos;
    const preview = mm.closestOpen('b', ghostPos)!;
    const events = mm.reconnect('b', 0);

    expect(preview.memberId).toBe('c');
    expect(mm.roomOf('b')!.id).toBe(preview.roomId);
    expect(joinedRoom(events).roomId).toBe(preview.roomId);
  });
});

describe('Matchmaker.tick (lone merge)', () => {
  it('merges a lone driver into the nearest open room after 15 s, at any distance', () => {
    const mm = make(3);
    mm.place('a', at(0), 0);
    mm.place('a2', at(0.1), 0);
    mm.place('a3', at(0.2), 0); // room1 full (3/3)
    mm.place('far', at(60), 1000); // room1 full -> opens room2, alone from the start
    mm.remove('a3', 1000); // free a seat in room1 (still 2 active, not alone)

    expect(mm.tick(1000 + 14_999)).toEqual([]);
    const events = mm.tick(1000 + 15_000);
    expect(events.map((e) => e.type)).toEqual(['left', 'room-deleted', 'joined']);
    expect(joinedRoom(events).reason).toBe('merge');
    expect(mm.roomOf('far')).toBe(mm.roomOf('a'));
    expect(mm.listRooms()).toHaveLength(1);
  });

  it('merges into the nearest open room', () => {
    const mm = make(3);
    mm.place('a', at(0), 0);
    mm.place('a2', at(0.1), 0);
    mm.place('a3', at(0.2), 0); // room1 full
    mm.place('b', at(30), 0); // room1 full -> room2
    mm.place('b2', at(30.1), 0);
    mm.place('b3', at(30.2), 0); // room2 full
    mm.place('loner', at(40), 0); // both full -> room3, alone
    mm.remove('a3', 0); // free room1 (still 2 active)
    mm.remove('b3', 0); // free room2 (still 2 active) — nearer to loner
    mm.tick(15_000);
    expect(mm.roomOf('loner')).toBe(mm.roomOf('b'));
  });

  it('merges two loners together', () => {
    const mm = make(2);
    mm.place('a', at(0), 0);
    mm.place('a2', at(0.1), 0); // room1 full
    mm.place('b', at(50), 0); // room1 full -> room2, alone
    mm.remove('a2', 0); // free room1 -> a is alone too
    mm.tick(15_000);
    expect(mm.roomOf('a')).toBe(mm.roomOf('b'));
    expect(mm.listRooms()).toHaveLength(1);
  });

  it('never merges into a full room, and keeps waiting', () => {
    const mm = make();
    for (let i = 0; i < 4; i++) mm.place(`p${i}`, at(i * 0.1), 0);
    mm.place('loner', at(40), 0);
    expect(mm.tick(60_000)).toEqual([]);
    expect(mm.roomOf('loner')).not.toBe(mm.roomOf('p0'));
    mm.remove('p3', 60_000);
    mm.tick(60_001);
    expect(mm.roomOf('loner')).toBe(mm.roomOf('p0'));
  });

  it('restarts the alone timer when someone joins then leaves', () => {
    const mm = make(3);
    mm.place('a', at(0), 0);
    mm.place('a1', at(0.1), 0);
    mm.place('a2', at(0.2), 0); // room A full (3/3)
    mm.place('far', at(60), 0);
    mm.place('far1', at(60.1), 0);
    mm.place('far2', at(60.2), 0); // room B full (3/3)
    mm.remove('a1', 10_000); // room A: 2 active, not alone
    mm.remove('far1', 10_000); // room B: 2 active, not alone
    mm.remove('a2', 12_000); // room A: 1 active (a) — alone since 12_000, not 0
    mm.remove('far2', 12_000); // room B: 1 active (far) — alone since 12_000, not 0
    // 20_000 - 12_000 = 8_000 < 15_000 for both, even though both rooms have been
    // open (with a member) since t=0.
    const events = mm.tick(20_000);
    expect(events).toEqual([]);
  });

  it('starts the timer when a room drops to one active driver', () => {
    const mm = make(3);
    mm.place('a', at(0), 0);
    mm.place('b', at(0.1), 0);
    mm.place('x', at(0.2), 0); // room1 full (3/3)
    mm.place('c', at(60), 0); // room1 full -> room2
    mm.place('c2', at(60.1), 0);
    mm.place('y', at(60.2), 0); // room2 full (3/3)
    mm.remove('x', 0); // now free room1: 2 active, has space
    mm.remove('y', 0); // now free room2: 2 active, has space
    mm.disconnect('b', 5_000); // room1: 1 active (a) — alone since 5_000
    expect(mm.tick(19_999)).toEqual([]);
    mm.tick(20_000);
    expect(mm.roomOf('a')).toBe(mm.roomOf('c'));
    // b stays behind as a ghost in the old room.
    expect(mm.roomOf('b')).not.toBe(mm.roomOf('a'));
  });
});

describe('disconnect / reconnect', () => {
  it('ghosts do not count toward capacity', () => {
    const mm = make();
    for (let i = 0; i < 4; i++) mm.place(`p${i}`, at(i * 0.1), 0);
    mm.disconnect('p3', 0);
    mm.place('new', at(0.2), 0);
    expect(mm.roomOf('new')).toBe(mm.roomOf('p0'));
    expect(mm.roomOf('p0')!.members.size).toBe(5);
    expect(mm.activeCount(mm.roomOf('p0')!)).toBe(4);
  });

  it('reconnects into the old room when it is still the closest with space', () => {
    const mm = make();
    mm.place('a', at(0), 0);
    mm.place('b', at(0.1), 0);
    const room = mm.roomOf('b');
    mm.disconnect('b', 0);
    expect(mm.reconnect('b', 0)).toEqual([
      { type: 'active-changed', memberId: 'b', roomId: room!.id, active: true },
    ]);
    expect(mm.roomOf('b')).toBe(room);
  });

  it('re-matches into a brand new room on reconnect when the old room filled up and nothing else is open', () => {
    const mm = make();
    mm.place('p0', at(0), 0);
    mm.place('ghost', at(0), 0);
    mm.disconnect('ghost', 0);
    for (let i = 1; i < 4; i++) mm.place(`p${i}`, at(i * 0.1), 0);
    expect(mm.roomOf('p3')).toBe(mm.roomOf('ghost'));
    const old = mm.roomOf('ghost');
    const events = mm.reconnect('ghost', 0);
    expect(events.map((e) => e.type)).toEqual(['left', 'room-created', 'joined']);
    expect(joinedRoom(events).reason).toBe('reconnect');
    expect(mm.roomOf('ghost')).not.toBe(old);
  });

  it('reconnect moves into a different, already-open room when the old one filled up while ghosted', () => {
    const mm = make(2);
    mm.place('a', at(0), 0);
    mm.place('b', at(0.1), 0); // room1 full
    mm.disconnect('b', 0);
    mm.place('x', at(0.15), 0); // refills room1 -> full again
    mm.place('c', at(1000), 0); // room1 full -> opens room2, still has space
    const events = mm.reconnect('b', 0);
    expect(events.map((e) => e.type)).toEqual(['left', 'joined']);
    expect(joinedRoom(events).reason).toBe('reconnect');
    expect(mm.roomOf('b')).toBe(mm.roomOf('c'));
  });

  it('moves you even when your own ghost room still has a free seat, if a closer room is open', () => {
    const mm = make(3);
    mm.place('a1', at(0), 0);
    mm.place('a2', at(0.1), 0);
    mm.place('g', at(0.2), 0); // room1 full (3/3)
    mm.place('b1', at(1000), 0); // room1 full -> opens room2
    mm.place('b2', at(1000.1), 0);
    mm.place('b3', at(1000.2), 0); // room2 full (3/3)
    mm.remove('a2', 0); // room1: 2 active (a1, g) — free seat, still has an active member
    mm.remove('b3', 0); // room2: 2 active (b1, b2) — free seat too
    mm.disconnect('g', 0); // g ghosts in room1, which still has a1 active with space
    mm.updatePosition('g', at(1000.15)); // g is now physically much closer to room2

    const room1 = mm.roomOf('g')!;
    expect(mm.activeCount(room1)).toBe(1); // own room still has space, not solo-ghost
    const events = mm.reconnect('g', 0);
    expect(events.map((e) => e.type)).toEqual(['left', 'joined']);
    expect(joinedRoom(events).reason).toBe('reconnect');
    expect(mm.roomOf('g')).toBe(mm.roomOf('b1')); // moved to the closer room, not its own
  });

  it('reconnect uses the position set after disconnecting, not the stale one from when you left', () => {
    const mm = make(3);
    mm.place('a', at(0), 0);
    mm.place('b', at(0.1), 0);
    mm.place('g', at(0.2), 0); // room1 full (3/3)
    mm.place('f1', at(1000), 0); // room1 full -> opens room2
    mm.place('f2', at(1000.1), 0); // room2: 2/3, still has space
    mm.remove('b', 0); // room1: 2 active (a, g), still has space
    mm.disconnect('g', 0); // g ghosts near 'a' — closestOpen would currently match room1
    mm.updatePosition('g', at(1000.05)); // drive the ghost near room2 instead

    const events = mm.reconnect('g', 0);
    expect(joinedRoom(events).roomId).toBe(mm.roomOf('f1')!.id);
  });

  it('deletes the old room if the ghost was its last member', () => {
    const mm = make();
    mm.place('a', at(0), 0);
    mm.disconnect('a', 0); // room1: 0 active, 1 ghost
    mm.place('b', at(1000), 0); // room1 has nobody active -> opens room2
    const events = mm.reconnect('a', 0);
    expect(events.map((e) => e.type)).toEqual(['left', 'room-deleted', 'joined']);
    expect(mm.roomOf('a')).toBe(mm.roomOf('b'));
  });

  it('ignores disconnect when already disconnected and reconnect when connected', () => {
    const mm = make();
    mm.place('a', at(0), 0);
    expect(mm.reconnect('a', 0)).toEqual([]);
    mm.disconnect('a', 0);
    expect(mm.disconnect('a', 0)).toEqual([]);
  });

  it('keeps a room alive while it only has ghosts, and skips it when placing', () => {
    const mm = make();
    mm.place('a', at(0), 0);
    mm.disconnect('a', 0);
    mm.place('b', at(0.1), 0);
    expect(mm.roomOf('b')).not.toBe(mm.roomOf('a'));
    expect(mm.listRooms()).toHaveLength(2);
  });
});

describe('Matchmaker.random', () => {
  /** capacity 2, three rooms each left with exactly one free seat, plus a fourth room holding the mover. */
  function threeOpenRoomsPlusGhost() {
    const mm = make(2);
    mm.place('a1', at(0), 0);
    mm.place('a2', at(0.1), 0);
    mm.place('b1', at(1000), 0);
    mm.place('b2', at(1000.1), 0);
    mm.place('c1', at(2000), 0);
    mm.place('c2', at(2000.1), 0);
    mm.place('m1', at(3000), 0);
    mm.place('m2', at(3000.1), 0);
    mm.remove('a2', 0);
    mm.remove('b2', 0);
    mm.remove('c2', 0);
    mm.disconnect('m1', 0);
    return { mm, room1: mm.roomOf('a1')!.id, room2: mm.roomOf('b1')!.id, room3: mm.roomOf('c1')!.id };
  }

  it('is null while connected', () => {
    const mm = make();
    mm.place('a', at(0), 0);
    expect(mm.random('a', 0, () => 0)).toBeNull();
  });

  it('is null when there is nowhere else open', () => {
    const mm = make();
    mm.place('a', at(0), 0);
    mm.disconnect('a', 0);
    expect(mm.random('a', 0, () => 0)).toBeNull();
  });

  it('picks uniformly among open rooms via the injected rng, excluding its own room', () => {
    const first = threeOpenRoomsPlusGhost();
    const e1 = joinedRoom(first.mm.random('m1', 0, () => 0)!);
    expect(e1.reason).toBe('random');
    expect(e1.roomId).toBe(first.room1);

    const second = threeOpenRoomsPlusGhost();
    expect(joinedRoom(second.mm.random('m1', 0, () => 0.4)!).roomId).toBe(second.room2);

    const third = threeOpenRoomsPlusGhost();
    expect(joinedRoom(third.mm.random('m1', 0, () => 0.99)!).roomId).toBe(third.room3);
  });

  it('never lands back in its own ghost room, and connects', () => {
    const mm = make(2);
    mm.place('a', at(0), 0);
    mm.place('b', at(0.1), 0); // room1 full
    mm.disconnect('b', 0);
    mm.place('x', at(0.15), 0); // refills room1 -> full again
    mm.place('c', at(1000), 0); // room1 full -> opens room2, the only candidate
    const events = mm.random('b', 0, () => 0)!;
    expect(events).not.toBeNull();
    expect(mm.roomOf('b')).toBe(mm.roomOf('c'));
    expect(mm.roomOf('b')).not.toBe(mm.roomOf('a'));
  });

  it('excludes full rooms and rooms that only have ghosts', () => {
    const mm = make(2);
    mm.place('a', at(0), 0);
    mm.place('me', at(0.1), 0); // room1 full (2/2)
    mm.place('full1', at(1000), 0);
    mm.place('full2', at(1000.1), 0); // room2 full (2/2) — must be excluded
    mm.place('ghost', at(2000), 0);
    mm.disconnect('ghost', 0); // room3: 0 active — must be excluded
    mm.place('open1', at(3000), 0);
    mm.place('open2', at(3000.1), 0); // room4: 2/2
    mm.remove('open2', 0); // room4: 1 active, has space — the only valid candidate
    mm.disconnect('me', 0);

    expect(mm.hasRandomTarget('me')).toBe(true);
    const events = mm.random('me', 0, () => 0)!;
    expect(events).not.toBeNull();
    expect(mm.roomOf('me')).toBe(mm.roomOf('open1'));
  });
});

describe('Matchmaker.hasRandomTarget', () => {
  it('is false when there are no other rooms, or the only other room is full', () => {
    const mm = make(2);
    mm.place('a', at(0), 0);
    expect(mm.hasRandomTarget('a')).toBe(false); // nowhere else exists yet
    mm.place('filler', at(0.05), 0); // fills a's own room (2/2) so the next placement opens a new one
    mm.place('b1', at(1000), 0); // a's room full -> opens room2
    mm.place('b2', at(1000.1), 0); // room2 full (2/2)
    expect(mm.hasRandomTarget('a')).toBe(false);
    mm.remove('b2', 0); // frees a seat
    expect(mm.hasRandomTarget('a')).toBe(true);
  });

  it('is false when the only other room has nothing but ghosts', () => {
    const mm = make(2);
    mm.place('a', at(0), 0);
    mm.place('g', at(1000), 0);
    mm.disconnect('g', 0); // room2: 0 active members
    expect(mm.hasRandomTarget('a')).toBe(false);
  });
});

describe('remove and naming', () => {
  it('deletes empty rooms and reuses their number', () => {
    const mm = make(2);
    mm.place('a', at(0), 0);
    mm.place('decoy', at(0.1), 0); // room1 full (2/2)
    mm.place('b', at(20), 0); // room1 full -> room2
    mm.place('b2', at(20.1), 0); // room2 full (2/2), so 'c' below can't join it either
    expect(mm.roomOf('b')?.name).toBe('Test #2');
    mm.remove('decoy', 0); // room1 back down to just 'a'
    const events = mm.remove('a', 0); // room1 now empty
    expect(events.map((e) => e.type)).toEqual(['left', 'room-deleted']);
    const c = joinedRoom(mm.place('c', at(40), 0)); // both existing rooms unusable -> new room
    expect(mm.getRoom(c.roomId)?.name).toBe('Test #1');
  });

  it('updates positions used for later matching', () => {
    const mm = make();
    mm.place('a', at(0), 0);
    mm.updatePosition('a', at(10));
    mm.place('b', at(9), 0);
    expect(mm.roomOf('b')).toBe(mm.roomOf('a'));
  });
});
