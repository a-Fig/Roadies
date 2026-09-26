/**
 * Fake phones for rehearsals and smoke tests. Each joins demo mode like a real
 * phone and publishes a mic track that "talks" (a short tone) every few seconds.
 *
 *   npx tsx server/src/tools/fake-phones.ts [count] [spot] [serverUrl]
 *   npx tsx server/src/tools/fake-phones.ts 5 hospital-curve http://localhost:8080
 */
import { randomUUID } from 'node:crypto';
import {
  AudioFrame,
  AudioSource,
  LocalAudioTrack,
  Room,
  TrackPublishOptions,
  TrackSource,
} from '@livekit/rtc-node';
import { randomCar, WS_PATH, type ServerMessage } from '@roadies/shared';
import WebSocket from 'ws';

const [countArg = '3', spotArg, serverArg = 'http://localhost:8080'] = process.argv.slice(2);
const SAMPLE_RATE = 48_000;
const FRAME_MS = 10;

async function fakePhone(index: number): Promise<void> {
  const profile = randomCar();
  const clientId = `fake-${randomUUID().slice(0, 8)}`;
  const tag = `[${index} ${profile.name}]`;
  const ws = new WebSocket(serverArg.replace(/^http/, 'ws') + WS_PATH);
  let room: Room | null = null;
  let stopTalking = () => {};

  const joinLiveKit = async (url: string, token: string) => {
    stopTalking();
    await room?.disconnect();
    room = new Room();
    await room.connect(url, token, { autoSubscribe: false, dynacast: false });
    const source = new AudioSource(SAMPLE_RATE, 1);
    const track = LocalAudioTrack.createAudioTrack('mic', source);
    await room.localParticipant!.publishTrack(track, new TrackPublishOptions({ source: TrackSource.SOURCE_MICROPHONE }));
    stopTalking = talk(source, index);
  };

  ws.on('open', () =>
    ws.send(JSON.stringify({ t: 'hello', clientId, mode: 'demo', profile, spot: spotArg || undefined })),
  );
  ws.on('message', (raw) => {
    const msg = JSON.parse(String(raw)) as ServerMessage;
    if (msg.t === 'assigned') {
      console.log(`${tag} in ${msg.room.name} (${msg.room.members.length} drivers)`);
      joinLiveKit(msg.livekit.url, msg.livekit.token).catch((e) => console.error(`${tag} LiveKit: ${e.message}`));
    } else if (msg.t === 'state') {
      console.log(`${tag} ${msg.cmd} (${msg.source}) ->`, msg.state);
    } else if (msg.t === 'reset') {
      ws.send(JSON.stringify({ t: 'hello', clientId, mode: 'demo', profile, spot: spotArg || undefined }));
    }
  });
  ws.on('close', () => console.log(`${tag} socket closed`));
}

/** A 1-second tone every ~6 seconds, silence otherwise. Returns a stop function. */
function talk(source: AudioSource, index: number): () => void {
  const samples = (SAMPLE_RATE * FRAME_MS) / 1000;
  const freq = 220 + index * 55;
  let t = 0;
  let stopped = false;
  const loop = async () => {
    const start = Date.now();
    let sent = 0;
    while (!stopped) {
      const frame = AudioFrame.create(SAMPLE_RATE, 1, samples);
      const speaking = (t / SAMPLE_RATE + index * 1.7) % 6 < 1;
      for (let i = 0; i < samples; i++, t++) {
        frame.data[i] = speaking ? Math.round(8000 * Math.sin((2 * Math.PI * freq * t) / SAMPLE_RATE)) : 0;
      }
      await source.captureFrame(frame);
      sent += FRAME_MS;
      const ahead = start + sent - Date.now();
      if (ahead > 0) await new Promise((r) => setTimeout(r, ahead));
    }
  };
  void loop();
  return () => {
    stopped = true;
  };
}

for (let i = 0; i < Number(countArg); i++) void fakePhone(i);
