import type { CarProfile, Lang, ServerMessage } from '@roadies/shared';
import { describe, expect, it } from 'vitest';
import { carIdFor, MAX_CARS, World } from '../src/world';

function setup() {
  let now = 1_000_000;
  let seed = 1;
  const created: string[] = [];
  const deleted: string[] = [];
  const langChanges: [string, Lang][] = [];
  const world = new World({
    now: () => now,
    rng: () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646,
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
});
