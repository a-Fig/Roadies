import type { ServerMessage } from '@roadies/shared';
import { describe, expect, it } from 'vitest';
import { World } from '../src/world';

describe('World.stats (home page)', () => {
  it('counts people online and connected; not bots, dropped sockets or disconnected drivers', () => {
    const world = new World({
      issueToken: async () => 'token',
      livekitUrl: 'wss://lk.test',
      listenerIdentity: 'roadies-listener',
    });
    const hello = (clientId: string) => {
      const inbox: ServerMessage[] = [];
      const send = (m: ServerMessage) => inbox.push(m);
      world.hello({ t: 'hello', clientId, mode: 'demo', profile: { name: clientId, make: 'Civic', color: 'Teal' } }, send);
      const welcome = inbox.find((m): m is Extract<ServerMessage, { t: 'welcome' }> => m.t === 'welcome')!;
      return { id: welcome.id, send };
    };
    expect(world.stats()).toEqual({ talking: 0 });

    const a = hello('phone-a');
    hello('phone-b');
    const c = hello('phone-c');
    world.spawnLoner();
    expect(world.stats()).toEqual({ talking: 3 });

    world.command(a.id, 'disconnect', 'voice');
    world.disconnected(c.id, c.send); // socket dropped; seat kept for the grace period
    expect(world.stats()).toEqual({ talking: 1 });

    world.command(a.id, 'connect', 'voice');
    expect(world.stats()).toEqual({ talking: 2 });
  });
});
