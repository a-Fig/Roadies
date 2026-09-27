import type { CarProfile, Lang, ServerMessage } from '@roadies/shared';
import { describe, expect, it } from 'vitest';
import { carIdFor, MAX_CARS, World } from '../src/world';

function setup(rng?: () => number) {
  let now = 1_000_000;
  let seed = 1;
  const created: string[] = [];
  const deleted: string[] = [];
  const langChanges: [string, Lang][] = [];
  const world = new World({
    now: () => now,
    rng: rng ?? (() => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646),
    issueToken: async (identity, _name, room) => `token:${identity}:${room}`,
    livekitUrl: 'wss://lk.test',
    listenerIdentity: 'roadies-listener',
    onRoomCreated: (id) => created.push(id),
    onRoomDeleted: (id) => deleted.push(id),
    onLangChanged: (id, lang) => langChanges.push([id, lang]),
  });
  const inboxes = new Map<string, ServerMessage[]>();
  // `id` here is the secret clientId a phone would send; World only ever
  // exposes the derived public id (`pub(id)` below) to the outside world.
  const join = (
    id: string,
    extra: {
      spot?: string;
      mode?: 'demo' | 'live';
      pos?: { lat: number; lng: number };
      profile?: CarProfile;
      lang?: string;
      join?: 'random';
    } = {},
  ) => {
    const inbox: ServerMessage[] = [];
    inboxes.set(id, inbox);
    const send = (m: ServerMessage) => inbox.push(m);
    world.hello(
      {
        t: 'hello',
        clientId: id,
        mode: extra.mode ?? 'demo',
        profile: extra.profile ?? { name: `Car ${id}`, make: 'Civic', color: 'Teal' },
        spot: extra.spot,
        pos: extra.pos,
        // A string, not a Lang: the server must cope with whatever a phone sends.
        lang: extra.lang as Lang | undefined,
        join: extra.join,
      },
      send,
    );
    return send;
  };
  const pub = carIdFor;
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
  return { world, join, pub, last, advance, flush, inboxes, created, deleted, langChanges };
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
      token: `token:${t.pub('car-00001')}:${assigned.room.id}`,
      listenerIdentity: 'roadies-listener',
    });
    expect(t.created).toEqual([assigned.room.id]);
  });

  it('overfills Hospital Curve with the opening wave: 4 + 2', async () => {
    const t = setup();
    for (let i = 0; i < 6; i++) t.join(`car-${String(i).padStart(5, '0')}`);
    await t.flush();
    const rooms = t.world.snapshot().rooms;
    expect(rooms.map((r) => [r.name, r.activeCount])).toEqual([
      ['Hospital Curve #1', 4],
      ['Hospital Curve #2', 2],
    ]);
  });

  it('applies a spoken command, confirms it, and updates the roster', async () => {
    const t = setup();
    t.join('car-aaaaa', { spot: 'sfo' });
    t.join('car-bbbbb', { spot: 'sfo' });
    await t.flush();
    expect(t.world.transcript(t.pub('car-aaaaa'), 'Mute.')).toBe('mute');
    expect(t.last('car-aaaaa', 'state')).toEqual({
      t: 'state',
      state: { selfMute: true, selfDeaf: false, connected: true },
      cmd: 'mute',
      source: 'voice',
    });
    const roster = t.last('car-bbbbb', 'roster')!;
    expect(roster.room.members.find((m) => m.id === t.pub('car-aaaaa'))?.state.selfMute).toBe(true);
    expect(t.world.snapshot().log[0]).toContain('mute');
  });

  it('ignores conversation', () => {
    const t = setup();
    t.join('car-aaaaa');
    expect(t.world.transcript(t.pub('car-aaaaa'), "please don't mute me")).toBeNull();
    expect(t.last('car-aaaaa', 'state')).toBeUndefined();
  });

  it("hears each car in its own language: a French car's \"coupe le micro\" mutes it, an English car's does not", () => {
    const t = setup();
    t.join('car-fr', { spot: 'sfo', lang: 'fr' });
    t.join('car-en', { spot: 'sfo' });
    expect(t.world.langOf(t.pub('car-fr'))).toBe('fr');
    expect(t.world.langOf(t.pub('car-en'))).toBe('en');

    expect(t.world.transcript(t.pub('car-fr'), ['Coupe le micro.'])).toBe('mute');
    expect(t.last('car-fr', 'state')?.state.selfMute).toBe(true);

    t.world.command(t.pub('car-en'), 'unmute', 'button');
    expect(t.world.transcript(t.pub('car-en'), ['Coupe le micro.'])).toBeNull();
    expect(t.last('car-en', 'state')?.state.selfMute).toBe(false);

    // English still works for the French car.
    expect(t.world.transcript(t.pub('car-fr'), 'unmute')).toBe('unmute');
  });

  it('stores the language from hello, falls back to English, and updates it on a later hello', () => {
    const t = setup();
    t.join('car-aaaaa', { lang: 'klingon' });
    t.join('car-bbbbb');
    expect(t.world.langOf(t.pub('car-aaaaa'))).toBe('en');
    expect(t.world.langOf(t.pub('car-bbbbb'))).toBe('en');
    expect(t.world.langOf('no-such-car')).toBe('en');

    // Settings change -> reload -> hello again from the same phone.
    t.join('car-aaaaa', { lang: 'vi' });
    expect(t.world.langOf(t.pub('car-aaaaa'))).toBe('vi');
    expect(t.langChanges).toEqual([[t.pub('car-aaaaa'), 'vi']]);
    expect(t.world.transcript(t.pub('car-aaaaa'), 'tắt mic')).toBe('mute');

    // Same language again: nothing to reopen.
    t.join('car-aaaaa', { lang: 'vi' });
    expect(t.langChanges).toHaveLength(1);
  });

  it('a returning phone brings its new name (e.g. the default name in a new language) to the room', async () => {
    const t = setup();
    const rouge = { name: 'Mustang rouge', make: 'Mustang', color: 'Red' };
    t.join('car-aaaaa', { spot: 'sfo', lang: 'fr', profile: rouge });
    t.join('car-bbbbb', { spot: 'sfo' });
    await t.flush();

    t.join('car-aaaaa', { spot: 'sfo', lang: 'es', profile: { ...rouge, name: 'Mustang rojo' } });
    await t.flush();
    expect(t.last('car-aaaaa', 'welcome')!.profile.name).toBe('Mustang rojo');
    const names = t.last('car-bbbbb', 'roster')!.room.members.map((m) => m.name);
    expect(names).toContain('Mustang rojo');
    expect(names).not.toContain('Mustang rouge');

    // A blank name keeps the one the car has.
    t.join('car-aaaaa', { spot: 'sfo', lang: 'es', profile: { ...rouge, name: '  ' } });
    expect(t.last('car-aaaaa', 'welcome')!.profile.name).toBe('Mustang rojo');
  });

  it('disconnect ghosts you out of the roster; connect brings you back', async () => {
    const t = setup();
    t.join('car-aaaaa', { spot: 'sfo' });
    t.join('car-bbbbb', { spot: 'sfo' });
    await t.flush();
    t.world.command(t.pub('car-aaaaa'), 'disconnect', 'voice');
    expect(t.last('car-bbbbb', 'roster')!.room.members.map((m) => m.id)).toEqual([t.pub('car-bbbbb')]);
    expect(t.last('car-aaaaa', 'state')!.state.connected).toBe(false);
    t.world.command(t.pub('car-aaaaa'), 'connect', 'voice');
    expect(t.last('car-bbbbb', 'roster')!.room.members.map((m) => m.id)).toEqual([t.pub('car-aaaaa'), t.pub('car-bbbbb')]);
  });

  it('resends the closest preview to a reconnecting socket even when nothing has changed', async () => {
    const t = setup();
    t.join('car-aaaaa', { spot: 'sfo' });
    t.join('car-bbbbb', { spot: 'sfo' });
    await t.flush();
    t.world.command(t.pub('car-aaaaa'), 'disconnect', 'voice');
    const firstPreview = t.last('car-aaaaa', 'closest')!;
    expect(firstPreview.match?.roomName).toBeDefined();

    // Simulate a page reload: the old socket drops, then a fresh `hello`
    // arrives for the same car while it's still disconnected. The dedupe key
    // recorded against the old socket must not suppress this — genuinely
    // never-seen-by-this-socket — preview.
    t.world.disconnected(t.pub('car-aaaaa'), t.world.getCar(t.pub('car-aaaaa'))!.send!);
    t.join('car-aaaaa'); // resumes the existing car on a brand-new inbox
    const secondPreview = t.last('car-aaaaa', 'closest');
    expect(secondPreview).toEqual(firstPreview);
  });

  it('does not resend the closest preview on every tick when nothing has changed', async () => {
    const t = setup();
    t.join('car-aaaaa', { spot: 'sfo' });
    t.join('car-bbbbb', { spot: 'sfo' });
    await t.flush();
    t.world.command(t.pub('car-aaaaa'), 'disconnect', 'voice');
    const countAfterDisconnect = t.inboxes.get('car-aaaaa')!.filter((m) => m.t === 'closest').length;
    t.advance(5_000);
    const countAfterTicks = t.inboxes.get('car-aaaaa')!.filter((m) => m.t === 'closest').length;
    expect(countAfterTicks).toBe(countAfterDisconnect);
  });

  it('ignores "random" while connected: no state change, no log, stays put', async () => {
    const t = setup();
    t.join('car-aaaaa', { spot: 'sfo' });
    await t.flush();
    const logLenBefore = t.world.snapshot().log.length;
    t.world.command(t.pub('car-aaaaa'), 'random', 'voice');
    expect(t.last('car-aaaaa', 'state')).toBeUndefined();
    expect(t.world.snapshot().log.length).toBe(logLenBefore);
    expect(t.world.getCar(t.pub('car-aaaaa'))!.state.connected).toBe(true);
  });

  it('"random" with nowhere else open falls back to "connect" (reactivates in place)', async () => {
    const t = setup();
    t.join('car-aaaaa', { spot: 'sfo' }); // alone: the only room is its own
    await t.flush();
    const roomBefore = t.world.snapshot().rooms[0]!.id;
    t.world.command(t.pub('car-aaaaa'), 'disconnect', 'voice');
    t.world.command(t.pub('car-aaaaa'), 'random', 'voice');
    expect(t.last('car-aaaaa', 'notice')).toBeUndefined();
    expect(t.world.getCar(t.pub('car-aaaaa'))!.state.connected).toBe(true);
    expect(t.world.snapshot().rooms.map((r) => r.id)).toEqual([roomBefore]);
  });

  it('a "random" move issues a fresh token for the new room, after the state update', async () => {
    const t = setup();
    t.join('car-a1', { spot: 'sfo' });
    t.join('car-a2', { spot: 'sfo' });
    t.join('car-a3', { spot: 'sfo' });
    t.join('car-a4', { spot: 'sfo' }); // SFO full (4/4)
    t.join('car-b1', { spot: 'palo-alto' }); // SFO full -> opens its own room, has space
    await t.flush();
    const oldRoom = t.last('car-a1', 'assigned')!.room.id;

    t.world.command(t.pub('car-a1'), 'disconnect', 'voice');
    t.world.command(t.pub('car-a1'), 'random', 'voice');
    await t.flush();

    const moved = t.last('car-a1', 'assigned')!;
    expect(moved.room.id).not.toBe(oldRoom);
    expect(moved.livekit.token).toBe(`token:${t.pub('car-a1')}:${moved.room.id}`);
    const state = t.last('car-a1', 'state')!;
    expect(state.cmd).toBe('random');

    // The `assigned` for the new room must reach the phone before the `state`
    // that flips it back to connected/transmitting (finding 4): otherwise the
    // phone briefly opens its mic to, and hears, the room it just left.
    const inbox = t.inboxes.get('car-a1')!;
    expect(inbox.indexOf(state)).toBeGreaterThan(inbox.lastIndexOf(moved));
  });

  it('a "connect" that moves rooms (old one is full again) issues a fresh token', async () => {
    const t = setup();
    t.join('car-a1', { spot: 'sfo' });
    t.join('car-a2', { spot: 'sfo' });
    t.join('car-a3', { spot: 'sfo' });
    t.join('car-a4', { spot: 'sfo' }); // SFO full (4/4)
    t.join('car-b1', { spot: 'palo-alto' }); // SFO full -> opens its own room, has space
    await t.flush();
    const oldRoom = t.last('car-a1', 'assigned')!.room.id;

    t.world.command(t.pub('car-a1'), 'disconnect', 'voice'); // SFO: 3 active, still has a seat
    t.join('car-a5', { spot: 'sfo' }); // refills SFO to 4/4, so reconnect can't stay put
    await t.flush();
    t.world.command(t.pub('car-a1'), 'connect', 'voice');
    await t.flush();

    const moved = t.last('car-a1', 'assigned')!;
    expect(moved.room.id).not.toBe(oldRoom);
    expect(moved.room.id).toBe(t.last('car-b1', 'assigned')!.room.id);
    expect(moved.livekit.token).toBe(`token:${t.pub('car-a1')}:${moved.room.id}`);
  });

  it('merges a lone commuter after 15 s and hands them a new token', async () => {
    const t = setup();
    // Rooms hold 4: fill San Jose first, so the loner is forced to open its
    // own room (any-distance placement would otherwise pull it straight in).
    t.join('car-aaaaa', { spot: 'san-jose' });
    t.join('car-bbbbb', { spot: 'san-jose' });
    t.join('car-ccccc', { spot: 'san-jose' });
    t.join('car-ddddd', { spot: 'san-jose' }); // San Jose room full (4/4)
    t.join('car-loner', { spot: 'loner' }); // full -> loner opens its own room, alone
    await t.flush();
    const lonerRoom = t.last('car-loner', 'assigned')!.room.id;
    t.world.command(t.pub('car-ddddd'), 'disconnect', 'voice'); // free a seat, still 3 active
    t.advance(14_000);
    await t.flush();
    expect(t.last('car-loner', 'assigned')!.room.id).toBe(lonerRoom);
    t.advance(2_000);
    await t.flush();
    const merged = t.last('car-loner', 'assigned')!;
    expect(merged.room.name).toBe('San Jose 101/880 #1');
    expect(merged.room.members).toHaveLength(4);
    expect(t.deleted).toContain(lonerRoom);
    expect(t.world.snapshot().log.some((l) => l.includes('merged into San Jose'))).toBe(true);
  });

  it('keeps a seat through a short network drop, then frees it', async () => {
    const t = setup();
    const send = t.join('car-aaaaa', { spot: 'sfo' });
    await t.flush();
    const room = t.last('car-aaaaa', 'assigned')!.room.id;
    t.world.disconnected(t.pub('car-aaaaa'), send);
    t.advance(10_000);
    t.join('car-aaaaa');
    await t.flush();
    expect(t.last('car-aaaaa', 'assigned')!.room.id).toBe(room);
    t.world.disconnected(t.pub('car-aaaaa'), () => {}); // stale socket closing: ignored
    t.advance(60_000);
    expect(t.world.getCar(t.pub('car-aaaaa'))).toBeDefined();
    t.world.disconnected(t.pub('car-aaaaa'), t.world.getCar(t.pub('car-aaaaa'))!.send!);
    t.advance(30_000);
    expect(t.world.getCar(t.pub('car-aaaaa'))).toBeUndefined();
    expect(t.deleted).toContain(room);
  });

  it('moves demo cars north and never past the head of their jam', () => {
    const t = setup();
    const ids = Array.from({ length: 6 }, (_, i) => `car-pa${i}00`);
    ids.forEach((id) => t.join(id, { spot: 'palo-alto' }));
    const start = ids.map((id) => t.world.getCar(t.pub(id))!.motion!.km);
    t.advance(600_000);
    const end = ids.map((id) => t.world.getCar(t.pub(id))!.motion!);
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
    expect(t.world.getCar(t.pub('car-live2'))?.pos).toEqual({ lat: 37.7749, lng: -122.4194 });
    expect(t.last('car-live2', 'welcome')?.state.selfMute).toBe(false); // normal mode joins live
  });

  it('presenter: spawn a lone bot, mute everyone, reset', async () => {
    const t = setup();
    t.join('car-aaaaa');
    const bot = t.world.spawnLoner();
    expect(bot.bot).toBe(true);
    expect(bot.id).toBe('bot-1'); // bots keep their bot-N id, not a hashed one
    expect(t.world.snapshot().cars).toHaveLength(2);
    t.world.command(t.pub('car-aaaaa'), 'unmute', 'voice');
    t.world.muteAll();
    expect(t.world.getCar(t.pub('car-aaaaa'))!.state.selfMute).toBe(true);
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
    t.world.setSpeakers(room, [t.pub('car-aaaaa')]);
    expect(t.world.getCar(t.pub('car-aaaaa'))!.speaking).toBe(false); // demo joins muted
    t.world.command(t.pub('car-aaaaa'), 'unmute', 'voice');
    t.world.setSpeakers(room, [t.pub('car-aaaaa')]);
    expect(t.world.getCar(t.pub('car-aaaaa'))!.speaking).toBe(true);
    t.world.command(t.pub('car-aaaaa'), 'mute', 'button');
    t.world.setSpeakers(room, [t.pub('car-aaaaa')]);
    expect(t.world.getCar(t.pub('car-aaaaa'))!.speaking).toBe(false);
  });

  // ---- security ----

  it('rejects a hello whose clientId is the listener identity', () => {
    const t = setup();
    t.join('roadies-listener');
    expect(t.last('roadies-listener', 'error')?.message).toBeTruthy();
    expect(t.last('roadies-listener', 'welcome')).toBeUndefined();
    expect(t.world.snapshot().cars).toHaveLength(0);
  });

  it('does not let a phone take over another car by sending its public id as clientId', async () => {
    const t = setup();
    const victimSend = t.join('car-victim', { spot: 'sfo' });
    await t.flush();
    const victimId = t.pub('car-victim');

    // An attacker who learned the victim's public id (from a roster, say)
    // tries to "become" that car by sending it back as their own clientId.
    t.join(victimId, { spot: 'sfo' });
    await t.flush();

    // The victim's car is untouched: same socket, same identity.
    expect(t.world.getCar(victimId)!.send).toBe(victimSend);
    // The attacker gets a brand new, unrelated car instead of the victim's.
    const attackerWelcome = t.last(victimId, 'welcome');
    expect(attackerWelcome?.id).toBeDefined();
    expect(attackerWelcome!.id).not.toBe(victimId);
  });

  it('caps total cars and rejects new hellos once full', () => {
    const t = setup();
    for (let i = 0; i < MAX_CARS; i++) t.join(`car-cap-${i}`);
    expect(t.world.snapshot().cars).toHaveLength(MAX_CARS);

    t.join('car-overflow');
    expect(t.last('car-overflow', 'error')?.message).toBeTruthy();
    expect(t.last('car-overflow', 'welcome')).toBeUndefined();
    expect(t.world.snapshot().cars).toHaveLength(MAX_CARS);
  });

  it('sanitizes car names: strips markup, keeps unicode letters and simple punctuation', () => {
    const t = setup();
    t.join('car-html', { profile: { name: '<script>alert(1)</script>', make: 'Civic', color: 'Teal' } });
    const name = t.world.getCar(t.pub('car-html'))!.profile.name;
    expect(name).not.toMatch(/[<>/]/);
    expect(name).toBe('scriptalert1script');

    t.join('car-uni', { profile: { name: "  Ñoño's Café_1! ", make: 'Civic', color: 'Teal' } });
    expect(t.world.getCar(t.pub('car-uni'))!.profile.name).toBe("Ñoño's Café_1!");

    // Default names in other languages, including accents typed as combining marks.
    t.join('car-vi', { profile: { name: 'Civic xanh ngọc', make: 'Civic', color: 'Teal' } });
    expect(t.world.getCar(t.pub('car-vi'))!.profile.name).toBe('Civic xanh ngọc');
    t.join('car-nfd', { profile: { name: 'Civic argentée', make: 'Civic', color: 'Silver' } });
    expect(t.world.getCar(t.pub('car-nfd'))!.profile.name).toBe('Civic argentée');
  });

  it('falls back to a random car name when the sanitized name is empty', () => {
    const t = setup();
    t.join('car-emoji', { profile: { name: '😀😀😀', make: 'Civic', color: 'Teal' } });
    const name = t.world.getCar(t.pub('car-emoji'))!.profile.name;
    expect(name.length).toBeGreaterThan(0);
    expect(name).toMatch(/^[A-Za-z0-9' -]+$/); // a real random car name, not leftover markup
  });

  describe('hello: join "random"', () => {
    const NEAR = { lat: 37.7749, lng: -122.4194 };
    const FAR = { lat: 40, lng: -122.4194 }; // hundreds of km away

    /** Room A (near, full at capacity 4) and room B (far, one seat free) - both real candidates for `random`. */
    function twoOpenRooms(rng?: () => number) {
      const t = setup(rng);
      for (let i = 0; i < 4; i++) t.join(`a${i}`, { mode: 'live', pos: NEAR }); // room A: 4/4
      t.join('b0', { mode: 'live', pos: FAR }); // A is full -> room B, 1/4
      t.world.command(t.pub('a0'), 'disconnect', 'button'); // A: 3/4, open again
      return t;
    }

    it('lands in a farther room instead of the closest one, driven by the injected rng', async () => {
      const t = twoOpenRooms(() => 0.99); // picks the last candidate, not the nearest
      t.join('newcar', { mode: 'live', pos: NEAR, join: 'random' });
      await t.flush();
      const assigned = t.last('newcar', 'assigned')!;
      expect(assigned.room.id).toBe(t.world.matchmaker.roomOf(t.pub('b0'))!.id);
      expect(t.world.matchmaker.roomOf(t.pub('newcar'))).not.toBe(t.world.matchmaker.roomOf(t.pub('a1')));
    });

    it('still opens a new room when nothing is open', async () => {
      const t = setup(() => 0);
      t.join('first-random', { mode: 'live', pos: NEAR, join: 'random' }); // the very first joiner: nowhere open yet
      await t.flush();
      expect(t.world.snapshot().rooms).toHaveLength(1);
      expect(t.last('first-random', 'assigned')).toBeDefined();
    });

    it('is ignored for a returning (already-placed) car', async () => {
      const t = twoOpenRooms(() => 0.99);
      await t.flush();
      const roomBefore = t.world.matchmaker.roomOf(t.pub('a1'));
      t.join('a1', { mode: 'live', pos: NEAR, join: 'random' }); // same clientId: a reconnect, not a fresh join
      await t.flush();
      expect(t.world.matchmaker.roomOf(t.pub('a1'))).toBe(roomBefore);
    });
  });
});
