import type { ServerMessage } from '@roadies/shared';
import { describe, expect, it } from 'vitest';
import { World } from '../src/world';

function setup() {
  let now = 1_000_000;
  let seed = 1;
  const created: string[] = [];
  const deleted: string[] = [];
  const world = new World({
    now: () => now,
    rng: () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646,
    issueToken: async (identity, _name, room) => `token:${identity}:${room}`,
    livekitUrl: 'wss://lk.test',
    listenerIdentity: 'listener',
    onRoomCreated: (id) => created.push(id),
    onRoomDeleted: (id) => deleted.push(id),
  });
  const inboxes = new Map<string, ServerMessage[]>();
  const join = (id: string, extra: { spot?: string; mode?: 'demo' | 'live'; pos?: { lat: number; lng: number } } = {}) => {
    const inbox: ServerMessage[] = [];
    inboxes.set(id, inbox);
    const send = (m: ServerMessage) => inbox.push(m);
    world.hello(
      {
        t: 'hello',
        clientId: id,
        mode: extra.mode ?? 'demo',
        profile: { name: `Car ${id}`, make: 'Civic', color: 'Teal' },
        spot: extra.spot,
        pos: extra.pos,
      },
      send,
    );
    return send;
  };
  const last = <T extends ServerMessage['t']>(id: string, t: T) =>
    inboxes
      .get(id)!
      .filter((m): m is Extract<ServerMessage, { t: T }> => m.t === t)
      .at(-1);
  const advance = (ms: number) => {
    for (let i = 0; i < ms / 1000; i++) {
      now += 1000;
      world.tick();
    }
  };
  const flush = () => new Promise((r) => setTimeout(r, 0));
  return { world, join, last, advance, flush, inboxes, created, deleted };
}

describe('World', () => {
  it('welcomes a demo car and assigns it a Hospital Curve room with a LiveKit token', async () => {
    const t = setup();
    t.join('car-00001');
    await t.flush();
    // Demo mode joins muted (DESIGN.md §1).
    expect(t.last('car-00001', 'welcome')?.state).toEqual({ selfMute: true, selfDeaf: false, connected: true });
    const assigned = t.last('car-00001', 'assigned')!;
    expect(assigned.room.name).toBe('Hospital Curve #1');
    expect(assigned.livekit).toEqual({
      url: 'wss://lk.test',
      token: `token:car-00001:${assigned.room.id}`,
      listenerIdentity: 'listener',
    });
    expect(t.created).toEqual([assigned.room.id]);
  });

  it('overfills Hospital Curve with the opening wave: 8 + 3', async () => {
    const t = setup();
    for (let i = 0; i < 11; i++) t.join(`car-${String(i).padStart(5, '0')}`);
    await t.flush();
    const rooms = t.world.snapshot().rooms;
    expect(rooms.map((r) => [r.name, r.activeCount])).toEqual([
      ['Hospital Curve #1', 8],
      ['Hospital Curve #2', 3],
    ]);
  });

  it('applies a spoken command, confirms it, and updates the roster', async () => {
    const t = setup();
    t.join('car-aaaaa', { spot: 'sfo' });
    t.join('car-bbbbb', { spot: 'sfo' });
    await t.flush();
    expect(t.world.transcript('car-aaaaa', 'Mute.')).toBe('mute');
    expect(t.last('car-aaaaa', 'state')).toEqual({
      t: 'state',
      state: { selfMute: true, selfDeaf: false, connected: true },
      cmd: 'mute',
      source: 'voice',
    });
    const roster = t.last('car-bbbbb', 'roster')!;
    expect(roster.room.members.find((m) => m.id === 'car-aaaaa')?.state.selfMute).toBe(true);
    expect(t.world.snapshot().log[0]).toContain('mute');
  });

  it('ignores conversation', () => {
    const t = setup();
    t.join('car-aaaaa');
    expect(t.world.transcript('car-aaaaa', "please don't mute me")).toBeNull();
    expect(t.last('car-aaaaa', 'state')).toBeUndefined();
  });

  it('disconnect ghosts you out of the roster; connect brings you back', async () => {
    const t = setup();
    t.join('car-aaaaa', { spot: 'sfo' });
    t.join('car-bbbbb', { spot: 'sfo' });
    await t.flush();
    t.world.command('car-aaaaa', 'disconnect', 'voice');
    expect(t.last('car-bbbbb', 'roster')!.room.members.map((m) => m.id)).toEqual(['car-bbbbb']);
    expect(t.last('car-aaaaa', 'state')!.state.connected).toBe(false);
    t.world.command('car-aaaaa', 'connect', 'voice');
    expect(t.last('car-bbbbb', 'roster')!.room.members.map((m) => m.id)).toEqual(['car-aaaaa', 'car-bbbbb']);
  });

  it('merges a lone commuter after 15 s and hands them a new token', async () => {
    const t = setup();
    t.join('car-aaaaa', { spot: 'san-jose' });
    t.join('car-bbbbb', { spot: 'san-jose' });
    t.join('car-loner', { spot: 'loner' });
    await t.flush();
    const lonerRoom = t.last('car-loner', 'assigned')!.room.id;
    t.advance(14_000);
    await t.flush();
    expect(t.last('car-loner', 'assigned')!.room.id).toBe(lonerRoom);
    t.advance(2_000);
    await t.flush();
    const merged = t.last('car-loner', 'assigned')!;
    expect(merged.room.name).toBe('San Jose 101/880 #1');
    expect(merged.room.members).toHaveLength(3);
    expect(t.deleted).toContain(lonerRoom);
    expect(t.world.snapshot().log.some((l) => l.includes('merged into San Jose'))).toBe(true);
  });

  it('keeps a seat through a short network drop, then frees it', async () => {
    const t = setup();
    const send = t.join('car-aaaaa', { spot: 'sfo' });
    await t.flush();
    const room = t.last('car-aaaaa', 'assigned')!.room.id;
    t.world.disconnected('car-aaaaa', send);
    t.advance(10_000);
    t.join('car-aaaaa');
    await t.flush();
    expect(t.last('car-aaaaa', 'assigned')!.room.id).toBe(room);
    t.world.disconnected('car-aaaaa', () => {}); // stale socket closing: ignored
    t.advance(60_000);
    expect(t.world.getCar('car-aaaaa')).toBeDefined();
    t.world.disconnected('car-aaaaa', t.world.getCar('car-aaaaa')!.send!);
    t.advance(30_000);
    expect(t.world.getCar('car-aaaaa')).toBeUndefined();
    expect(t.deleted).toContain(room);
  });

  it('moves demo cars north and never past the head of their jam', () => {
    const t = setup();
    const ids = Array.from({ length: 6 }, (_, i) => `car-pa${i}00`);
    ids.forEach((id) => t.join(id, { spot: 'palo-alto' }));
    const start = ids.map((id) => t.world.getCar(id)!.motion!.km);
    t.advance(600_000);
    const end = ids.map((id) => t.world.getCar(id)!.motion!);
    end.forEach((m, i) => {
      expect(m.km).toBeGreaterThanOrEqual(start[i]!);
      expect(m.km).toBeLessThanOrEqual(m.capKm);
    });
    expect(end.some((m, i) => m.km > start[i]! + 0.05)).toBe(true);
  });

  it('uses GPS in live mode and requires it', () => {
    const t = setup();
    t.join('car-live1', { mode: 'live' });
    expect(t.last('car-live1', 'error')).toBeDefined();
    t.join('car-live2', { mode: 'live', pos: { lat: 37.7749, lng: -122.4194 } });
    expect(t.world.getCar('car-live2')?.pos).toEqual({ lat: 37.7749, lng: -122.4194 });
    expect(t.last('car-live2', 'welcome')?.state.selfMute).toBe(false); // normal mode joins live
  });

  it('presenter: spawn a lone bot, mute everyone, reset', async () => {
    const t = setup();
    t.join('car-aaaaa');
    const bot = t.world.spawnLoner();
    expect(bot.bot).toBe(true);
    expect(t.world.snapshot().cars).toHaveLength(2);
    t.world.command('car-aaaaa', 'unmute', 'voice');
    t.world.muteAll();
    expect(t.world.getCar('car-aaaaa')!.state.selfMute).toBe(true);
    expect(t.last('car-aaaaa', 'state')!.source).toBe('presenter');
    t.world.reset();
    expect(t.last('car-aaaaa', 'reset')).toEqual({ t: 'reset' });
    expect(t.world.snapshot().cars).toHaveLength(0);
    expect(t.world.snapshot().rooms).toHaveLength(0);
  });

  it('shows someone as speaking only while they are transmitting', async () => {
    const t = setup();
    t.join('car-aaaaa');
    await t.flush();
    const room = t.last('car-aaaaa', 'assigned')!.room.id;
    t.world.setSpeakers(room, ['car-aaaaa']);
    expect(t.world.getCar('car-aaaaa')!.speaking).toBe(false); // demo joins muted
    t.world.command('car-aaaaa', 'unmute', 'voice');
    t.world.setSpeakers(room, ['car-aaaaa']);
    expect(t.world.getCar('car-aaaaa')!.speaking).toBe(true);
    t.world.command('car-aaaaa', 'mute', 'button');
    t.world.setSpeakers(room, ['car-aaaaa']);
    expect(t.world.getCar('car-aaaaa')!.speaking).toBe(false);
  });
});
