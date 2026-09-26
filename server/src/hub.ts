import type { Server } from 'node:http';
import { COMMANDS, WS_PATH, type ClientMessage, type Command, type LatLng, type PresenterAction } from '@roadies/shared';
import { WebSocket, WebSocketServer } from 'ws';
import type { Send, World } from './world';

const HEARTBEAT_MS = 20_000;
const PRESENTER_FPS = 4;

const isCommand = (c: unknown): c is Command => COMMANDS.includes(c as Command);
const isLatLng = (p: unknown): p is LatLng =>
  typeof p === 'object' &&
  p !== null &&
  Number.isFinite((p as LatLng).lat) &&
  Number.isFinite((p as LatLng).lng) &&
  Math.abs((p as LatLng).lat) <= 90 &&
  Math.abs((p as LatLng).lng) <= 180;
const isClientId = (id: unknown): id is string => typeof id === 'string' && /^[\w-]{8,64}$/.test(id);

function parse(raw: unknown): Record<string, unknown> | null {
  try {
    const msg = JSON.parse(String(raw));
    return typeof msg === 'object' && msg !== null ? msg : null;
  } catch {
    return null;
  }
}

/** Phones and the projector talk to the world over one WebSocket endpoint. */
export function attachHub(server: Server, world: World, presenterKey: string) {
  const wss = new WebSocketServer({ server, path: WS_PATH });
  const presenters = new Set<WebSocket>();
  const alive = new WeakMap<WebSocket, boolean>();

  wss.on('connection', (ws, req) => {
    alive.set(ws, true);
    ws.on('pong', () => alive.set(ws, true));
    const params = new URL(req.url ?? '/', 'http://localhost').searchParams;

    if (params.get('role') === 'presenter') {
      if (params.get('key') !== presenterKey) {
        ws.close(4001, 'Wrong presenter key');
        return;
      }
      presenters.add(ws);
      ws.send(JSON.stringify(world.snapshot()));
      ws.on('message', (raw) => handlePresenter(world, parse(raw) as PresenterAction | null));
      ws.on('close', () => presenters.delete(ws));
      return;
    }

    let carId: string | null = null;
    const send: Send = (msg) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    };
    ws.on('message', (raw) => {
      const msg = parse(raw) as ClientMessage | null;
      if (!msg) return;
      if (msg.t === 'hello') {
        if (!isClientId(msg.clientId) || (msg.mode !== 'demo' && msg.mode !== 'live')) {
          send({ t: 'error', message: 'Bad hello.' });
          return;
        }
        if (msg.pos !== undefined && !isLatLng(msg.pos)) delete msg.pos;
        if (msg.spot !== undefined && typeof msg.spot !== 'string') delete msg.spot;
        carId = msg.clientId;
        world.hello(msg, send);
      } else if (!carId) {
        return;
      } else if (msg.t === 'pos' && isLatLng(msg.pos)) {
        world.position(carId, msg.pos);
      } else if (msg.t === 'cmd' && isCommand(msg.cmd)) {
        world.command(carId, msg.cmd, 'button');
      }
    });
    ws.on('close', () => {
      if (carId) world.disconnected(carId, send);
    });
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.get(ws)) {
        ws.terminate();
        continue;
      }
      alive.set(ws, false);
      ws.ping();
    }
  }, HEARTBEAT_MS);

  const presenterFeed = setInterval(() => {
    if (presenters.size === 0) return;
    const snapshot = JSON.stringify(world.snapshot());
    for (const p of presenters) if (p.readyState === WebSocket.OPEN) p.send(snapshot);
  }, 1000 / PRESENTER_FPS);

  return {
    close() {
      clearInterval(heartbeat);
      clearInterval(presenterFeed);
      wss.close();
    },
  };
}

function handlePresenter(world: World, msg: PresenterAction | null): void {
  if (msg?.t !== 'admin') return;
  switch (msg.action) {
    case 'reset':
      world.reset();
      break;
    case 'spawn-loner':
      world.spawnLoner();
      break;
    case 'mute-all':
      world.muteAll();
      break;
    case 'mute-car':
      if (typeof msg.carId === 'string') world.command(msg.carId, 'mute', 'presenter');
      break;
  }
}
