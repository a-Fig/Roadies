import { describe, expect, it } from 'vitest';
import type { LatLng } from '../src/geo';
import { Matchmaker, type MatchEvent } from '../src/matchmaker';

const BASE: LatLng = { lat: 37.5, lng: -122.2 };
/** A point `km` north of BASE. */
const at = (km: number): LatLng => ({ lat: BASE.lat + km / 111.195, lng: BASE.lng });

const make = () => new Matchmaker({ namer: () => 'Test' });

const joinedRoom = (events: MatchEvent[]) => {
  const e = events.find((x) => x.type === 'joined');
  if (!e || e.type !== 'joined') throw new Error('no joined event');
  return e;
};

describe('Matchmaker.place', () => {
  it('starts a new named room for the first driver', () => {
    const mm = make();
    const events = mm.place('a', at(0), 0);
    expect(events.map((e) => e.type)).toEqual(['room-created', 'joined']);
    expect(joinedRoom(events).reason).toBe('new-room');
    expect(mm.roomOf('a')?.name).toBe('Test #1');
  });

  it('joins a room with someone within 5 km', () => {
    const mm = make();
    mm.place('a', at(0), 0);
    const e = joinedRoom(mm.place('b', at(4.9), 0));
    expect(e.reason).toBe('nearby');
    expect(mm.roomOf('b')).toBe(mm.roomOf('a'));
  });

  it('starts a new room when nobody is within 5 km', () => {
    const mm = make();
    mm.place('a', at(0), 0);
    mm.place('b', at(5.2), 0);
    expect(mm.roomOf('b')).not.toBe(mm.roomOf('a'));
    expect(mm.roomOf('b')?.name).toBe('Test #2');
  });

  it('measures distance to the nearest member, not the room center', () => {
    const mm = make();
    mm.place('a', at(0), 0);
    mm.place('b', at(4), 0);
    mm.place('c', at(8), 0); // 4 km from b, 8 km from a
    expect(mm.roomOf('c')).toBe(mm.roomOf('a'));
  });

  it('picks the nearest of several nearby rooms', () => {
    const mm = make();
    mm.place('a', at(0), 0);
    mm.place('b', at(6), 0);
    mm.place('c', at(3.5), 0); // 3.5 km from a, 2.5 km from b
    expect(mm.roomOf('c')).toBe(mm.roomOf('b'));
  });

  it('caps rooms at 8 and opens a new room for the 9th', () => {
    const mm = make();
    for (let i = 0; i < 9; i++) mm.place(`p${i}`, at(i * 0.1), 0);
    const first = mm.roomOf('p0')!;
    expect(mm.activeCount(first)).toBe(8);
    expect(mm.roomOf('p8')).not.toBe(first);
    expect(mm.roomOf('p8')?.name).toBe('Test #2');
  });

  it('refuses to place the same driver twice', () => {
    const mm = make();
    mm.place('a', at(0), 0);
    expect(() => mm.place('a', at(0), 0)).toThrow();
  });
});

describe('Matchmaker.tick (lone merge)', () => {
  it('merges a lone driver into the nearest open room after 15 s, at any distance', () => {
    const mm = make();
    mm.place('a', at(0), 0);
    mm.place('b', at(0.1), 0);
    mm.place('far', at(60), 1000);
    const nearer = make(); // sanity: distance really is > 5 km
    nearer.place('a', at(0), 0);
    nearer.place('far', at(60), 0);
    expect(nearer.roomOf('far')).not.toBe(nearer.roomOf('a'));

    expect(mm.tick(15_999)).toEqual([]);
    const events = mm.tick(16_000);
    expect(events.map((e) => e.type)).toEqual(['left', 'room-deleted', 'joined']);
    expect(joinedRoom(events).reason).toBe('merge');
    expect(mm.roomOf('far')).toBe(mm.roomOf('a'));
    expect(mm.listRooms()).toHaveLength(1);
  });

  it('merges into the nearest open room', () => {
    const mm = make();
    mm.place('a', at(0), 0);
    mm.place('a2', at(0.1), 0);
    mm.place('b', at(30), 0);
    mm.place('b2', at(30.1), 0);
    mm.place('loner', at(40), 0);
    mm.tick(15_000);
    expect(mm.roomOf('loner')).toBe(mm.roomOf('b'));
  });

  it('merges two loners together', () => {
    const mm = make();
    mm.place('a', at(0), 0);
    mm.place('b', at(50), 0);
    mm.tick(15_000);
    expect(mm.roomOf('a')).toBe(mm.roomOf('b'));
    expect(mm.listRooms()).toHaveLength(1);
  });

  it('never merges into a full room, and keeps waiting', () => {
    const mm = make();
    for (let i = 0; i < 8; i++) mm.place(`p${i}`, at(i * 0.1), 0);
    mm.place('loner', at(40), 0);
    expect(mm.tick(60_000)).toEqual([]);
    expect(mm.roomOf('loner')).not.toBe(mm.roomOf('p0'));
    mm.remove('p7', 60_000);
    mm.tick(60_001);
    expect(mm.roomOf('loner')).toBe(mm.roomOf('p0'));
  });

  it('restarts the alone timer when someone joins then leaves', () => {
    const mm = make();
    mm.place('a', at(0), 0);
    mm.place('b', at(0.1), 10_000);
    mm.remove('b', 12_000);
    mm.place('far', at(60), 12_000);
    // a has been alone since 12 s, not since 0 s.
    const events = mm.tick(20_000);
    expect(events).toEqual([]);
  });

  it('starts the timer when a room drops to one active driver', () => {
    const mm = make();
    mm.place('a', at(0), 0);
    mm.place('b', at(0.1), 0);
    mm.place('c', at(60), 0);
    mm.place('c2', at(60.1), 0);
    mm.disconnect('b', 5_000);
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
    for (let i = 0; i < 8; i++) mm.place(`p${i}`, at(i * 0.1), 0);
    mm.disconnect('p3', 0);
    mm.place('new', at(0.2), 0);
    expect(mm.roomOf('new')).toBe(mm.roomOf('p0'));
    expect(mm.roomOf('p0')!.members.size).toBe(9);
    expect(mm.activeCount(mm.roomOf('p0')!)).toBe(8);
  });

  it('reconnects into the old room when it has space', () => {
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

  it('re-matches on reconnect when the old room filled up', () => {
    const mm = make();
    mm.place('p0', at(0), 0);
    mm.place('ghost', at(0), 0);
    mm.disconnect('ghost', 0);
    for (let i = 1; i < 8; i++) mm.place(`p${i}`, at(i * 0.1), 0);
    expect(mm.roomOf('p7')).toBe(mm.roomOf('ghost'));
    const old = mm.roomOf('ghost');
    const events = mm.reconnect('ghost', 0);
    expect(events.map((e) => e.type)).toEqual(['left', 'room-created', 'joined']);
    expect(mm.roomOf('ghost')).not.toBe(old);
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

describe('remove and naming', () => {
  it('deletes empty rooms and reuses their number', () => {
    const mm = make();
    mm.place('a', at(0), 0);
    mm.place('b', at(20), 0);
    expect(mm.roomOf('b')?.name).toBe('Test #2');
    const events = mm.remove('a', 0);
    expect(events.map((e) => e.type)).toEqual(['left', 'room-deleted']);
    mm.place('c', at(40), 0);
    expect(mm.roomOf('c')?.name).toBe('Test #1');
  });

  it('updates positions used for later matching', () => {
    const mm = make();
    mm.place('a', at(0), 0);
    mm.updatePosition('a', at(10));
    mm.place('b', at(9), 0);
    expect(mm.roomOf('b')).toBe(mm.roomOf('a'));
  });
});
