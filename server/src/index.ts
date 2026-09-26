import { existsSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { config, LISTENER_IDENTITY } from './config';
import { attachHub } from './hub';
import { ListenerManager } from './listener';
import { createTokenIssuer } from './livekit';
import { FakeRecognizer } from './recognizer/fake';
import { GoogleSpeechRecognizer } from './recognizer/google';
import type { Recognizer } from './recognizer/types';
import { World } from './world';

const issueToken = createTokenIssuer(config.livekit);
const recognizer: Recognizer =
  config.recognizer === 'google' ? new GoogleSpeechRecognizer(config.googleSttModel) : new FakeRecognizer();

let listener: ListenerManager | null = null;
const world = new World({
  issueToken: (identity, name, room) => issueToken(identity, name, room),
  livekitUrl: config.livekit.publicUrl,
  listenerIdentity: LISTENER_IDENTITY,
  onRoomCreated: (roomId) => void listener?.join(roomId),
  onRoomDeleted: (roomId) => void listener?.leave(roomId),
});

if (config.listener) {
  listener = new ListenerManager({
    url: config.livekit.url,
    identity: LISTENER_IDENTITY,
    issueToken,
    recognizer,
    onTranscript: (carId, text) => {
      const cmd = world.transcript(carId, text);
      if (config.logTranscripts) console.log(`[stt] ${carId}: "${text}" -> ${cmd ?? '(not a command)'}`);
    },
    onSpeakers: (roomId, identities) => world.setSpeakers(roomId, identities),
  });
}

const ticker = setInterval(() => world.tick(), 1000);

const app = express();
app.use(express.json({ limit: '16kb' }));
app.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

if (config.devEndpoints) {
  /** Pretend the listener heard `text` from a car (by id or display name). */
  app.post('/dev/say', (req, res) => {
    const { carId, name, text } = (req.body ?? {}) as { carId?: string; name?: string; text?: string };
    const car =
      (carId && world.getCar(carId)) ||
      world.listCars().find((c) => name && c.profile.name.toLowerCase() === name.toLowerCase());
    if (!car || typeof text !== 'string') {
      res.status(404).json({ error: 'No such car, or no text.' });
      return;
    }
    res.json({ carId: car.id, cmd: world.transcript(car.id, text) });
  });
  app.get('/dev/state', (_req, res) => {
    res.json({
      snapshot: world.snapshot(),
      listener: listener && { rooms: listener.roomIds, subscriptions: listener.subscriptions() },
      heardSamples: recognizer instanceof FakeRecognizer ? Object.fromEntries(recognizer.samples) : null,
    });
  });
}

if (existsSync(config.webDist)) {
  app.use(express.static(config.webDist, { index: false }));
  // Single-page app: /, /demo, /presenter all load the same page.
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/dev/') || path.extname(req.path)) return next();
    res.sendFile(path.join(config.webDist, 'index.html'));
  });
}

const server = http.createServer(app);
const hub = attachHub(server, world, config.presenterKey);
server.listen(config.port, () => {
  console.log(`Roadies server on :${config.port}`);
  console.log(`  LiveKit: ${config.livekit.url} (phones use ${config.livekit.publicUrl})`);
  console.log(`  Recognizer: ${config.recognizer}, listener: ${config.listener ? 'on' : 'off'}`);
  if (config.devEndpoints) console.log('  Dev endpoints: /dev/say, /dev/state');
});

async function shutdown() {
  clearInterval(ticker);
  hub.close();
  server.close();
  await listener?.close();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
