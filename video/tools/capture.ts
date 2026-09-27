/**
 * Records the real app for the reel: the projector and the hero's phone, while
 * the cast's ElevenLabs clips play into headless phones' microphones. The real
 * listener + Google STT hear them, so every mute, room change and merge on
 * screen is the app reacting to speech. Nothing uses /dev/say; /dev/state is
 * only read, to verify each command landed and to log event times.
 *
 *   npm run capture -- [--web http://localhost:5173] [--server http://localhost:8080] [--loner-in Gilroy]
 *
 * `--loner-in`: the demo drops the lone Mustang at a random spot between
 * Gilroy and Morgan Hill; unless he lands in this place, the take is dropped
 * (its folder deleted) and the process exits with code 3, so a shell loop can
 * go again. Without it, the reel names wherever he landed.
 *
 * Needs the dev stack running (`npm run dev` at the repo root) with
 * RECOGNIZER=google and PRESENTER_KEY in .env. Writes
 * public/gen/captures/<take>/{presenter.mp4,hero.mp4,events.json}.
 *
 * Frames come from Chrome's screencast (with timestamps) rather than
 * Playwright's video recorder: sharper, and the timestamps line the recordings
 * up with the voice clips without a clapper.
 */
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { corridor, type LatLng, type WorldSnapshot } from '@roadies/shared';
import { chromium, type Browser, type BrowserContext, type CDPSession, type Page } from '@playwright/test';
import { CAST, type CastId } from '../src/cast';
import type { CaptureEvent, CaptureLog } from '../src/capture-log';
import { LINES, type LineId } from '../src/lines';
import { ffmpegPipe } from './ffmpeg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1]! : fallback;
};
const WEB = arg('web', 'http://localhost:5173');
const SERVER = arg('server', 'http://localhost:8080');
const LONER_IN = arg('loner-in', '');
/** Exit code for a take dropped by `--loner-in`. */
const LONER_MISSED = 3;
const PRESENTER_KEY = process.env.PRESENTER_KEY;
if (!PRESENTER_KEY) throw new Error('PRESENTER_KEY is not set (repo .env)');

const take = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = path.join(root, 'public', 'gen', 'captures', take);
mkdirSync(outDir, { recursive: true });
// The reel plays the app's own sounds (the Discord mp3s) where the phones played them.
cpSync(path.join(root, '..', 'web', 'public', 'audio'), path.join(root, 'public', 'gen', 'app-audio'), { recursive: true });

const events: CaptureEvent[] = [];
const log = (kind: string, data: Record<string, unknown> = {}) => logAt(Date.now(), kind, data);
const logAt = (t: number, kind: string, data: Record<string, unknown> = {}) => {
  const e = { t, kind, ...data };
  events.push(e);
  console.log(`${((e.t - startedAt) / 1000).toFixed(1).padStart(6)}s  ${kind} ${JSON.stringify(data)}`);
};
const startedAt = Date.now();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Microphone shim: getUserMedia returns a WebAudio stream carrying a quiet room
// noise floor (like stt-check's) plus whatever window.__say() plays.

const MIC_SHIM = `(() => {
  const ctx = new AudioContext({ sampleRate: 48000 });
  const dest = ctx.createMediaStreamDestination();
  const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.0042;
  const floor = ctx.createBufferSource();
  floor.buffer = noise;
  floor.loop = true;
  floor.connect(dest);
  floor.start();
  navigator.mediaDevices.getUserMedia = async (constraints) => {
    await ctx.resume();
    if (!constraints || !constraints.audio) throw new DOMException('video not available', 'NotFoundError');
    return new MediaStream([dest.stream.getAudioTracks()[0].clone()]);
  };
  window.__say = async (b64) => {
    await ctx.resume();
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const buffer = await ctx.decodeAudioData(bytes.buffer);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(dest);
    src.start();
    await new Promise((resolve) => (src.onended = resolve));
    // Timed from its end: a busy tab (one that just switched LiveKit rooms, say)
    // can stall its audio for seconds before the clip starts.
    return { startedAt: Date.now() - buffer.duration * 1000, duration: buffer.duration };
  };
})();`;

// Reports each Discord sound a phone plays (web/src/lib/chimes.ts) with the
// moment it started, so the reel's chimes land where the app really played
// them. Decoded buffers are tagged with their file name on the way in.
const CHIME_HOOK = `(() => {
  const names = new WeakMap();
  const fetch0 = window.fetch;
  window.fetch = async (...args) => {
    const res = await fetch0(...args);
    const url = typeof args[0] === 'string' ? args[0] : args[0].url;
    const m = /\\/audio\\/([\\w-]+)\\.mp3$/.exec(url);
    if (m) {
      const read = res.arrayBuffer.bind(res);
      res.arrayBuffer = async () => {
        const bytes = await read();
        names.set(bytes, m[1]);
        return bytes;
      };
    }
    return res;
  };
  const decode0 = BaseAudioContext.prototype.decodeAudioData;
  BaseAudioContext.prototype.decodeAudioData = function (bytes, ...rest) {
    const name = names.get(bytes);
    return decode0.call(this, bytes, ...rest).then((buffer) => {
      if (name) names.set(buffer, name);
      return buffer;
    });
  };
  const start0 = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...args) {
    const name = this.buffer && names.get(this.buffer);
    if (name) window.__chime(name, Date.now());
    return start0.apply(this, args);
  };
})();`;

// Off-camera phones still render; with a dozen of them, endless CSS pulses
// starve the two screencasts of frames. Nobody sees these, so freeze them.
const STILL = `document.addEventListener('DOMContentLoaded', () => {
  const style = document.createElement('style');
  style.textContent = '*, *::before, *::after { animation: none !important; transition: none !important; }';
  document.head.append(style);
});`;

// The projector's clock, slowed on demand: Leaflet times flyToBounds with
// Date.now, so a slowed clock flies the map in slow motion, and the screencast
// catches several times the frames (the reel plays that window back sped up).
// Once the window ends the clock is real again (it jumps ahead).
const WARP = `(() => {
  const realNow = Date.now.bind(Date);
  let warp = null;
  Date.now = () => {
    const r = realNow();
    return warp && r < warp.until ? warp.start + (r - warp.start) / warp.factor : r;
  };
  window.__warp = (factor, ms) => {
    const start = realNow();
    warp = { start, factor, until: start + ms };
    return start;
  };
})();`;

declare global {
  interface Window {
    __warp: (factor: number, ms: number) => number;
    __say: (b64: string) => Promise<{ startedAt: number; duration: number }>;
    __chime: (file: string, t: number) => void;
  }
}

// ---------------------------------------------------------------------------
// Screencast recorder

const FPS = 30;

/**
 * Records a page's screencast as a constant 30 fps mp4. Chrome sends a frame
 * only when the page repaints, stamped with its capture time. During the take
 * the frames only go to disk: encoding 4.6 MP video live competes with the
 * browsers and the listener for the CPU and halves the projector's frame rate.
 * `encode()` then repeats each frame until the next one's timestamp, so video
 * frame k shows the page at t0 + k/30 s.
 */
class Recorder {
  private cdp: CDPSession | null = null;
  private readonly dir: string;
  private frames: { file: string; t: number }[] = [];
  private writes: Promise<void>[] = [];
  private frameSize = { width: 0, height: 0 };
  private size = { maxWidth: 0, maxHeight: 0 };

  constructor(
    private readonly name: string,
    private readonly page: Page,
  ) {
    this.dir = path.join(outDir, `${name}-frames`);
    mkdirSync(this.dir, { recursive: true });
  }

  async start(maxWidth: number, maxHeight: number): Promise<void> {
    this.size = { maxWidth, maxHeight };
    this.cdp = await this.page.context().newCDPSession(this.page);
    this.cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
      void this.cdp?.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
      const t = metadata.timestamp ? metadata.timestamp * 1000 : Date.now();
      const frame = Buffer.from(data, 'base64');
      if (this.frames.length === 0) this.frameSize = jpegSize(frame);
      const file = path.join(this.dir, `${String(this.frames.length).padStart(5, '0')}.jpg`);
      this.frames.push({ file, t });
      this.writes.push(writeFile(file, frame));
    });
    await this.resume();
  }

  /**
   * Stops grabbing frames (the video holds its last frame) to leave the CPU to
   * another recording; with a handful of live phones, two screencasts at once
   * drop to ~5 fps.
   */
  async pause(): Promise<void> {
    await this.cdp?.send('Page.stopScreencast');
    log('paused', { who: this.name });
  }

  async resume(): Promise<void> {
    await this.cdp!.send('Page.startScreencast', { format: 'jpeg', quality: 92, ...this.size, everyNthFrame: 1 });
  }

  /** Stops grabbing; `encode()` once the browsers are closed. */
  async stop(): Promise<void> {
    await this.cdp?.send('Page.stopScreencast').catch(() => {});
    if (this.frames.length === 0) throw new Error(`${this.name}: no frames captured`);
    this.frames.push({ file: '', t: Date.now() }); // the end, holding the last frame
    await Promise.all(this.writes);
  }

  /** Encodes the mp4; returns the epoch ms of video time 0, its length and frame size. */
  async encode(): Promise<{ t0: number; frames: number; width: number; height: number }> {
    const ff = ffmpegPipe([
      '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(FPS), '-i', '-',
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p',
      '-c:v', 'libx264', '-crf', '16', '-preset', 'medium',
      // A keyframe every second and no B-frames: the reel seeks all over these,
      // and Remotion decodes from the last keyframe into a cache that a
      // 250-frame GOP of 1080x1920 frames overflows ("No frame found at position").
      '-g', String(FPS), '-bf', '0',
      path.join(outDir, `${this.name}.mp4`),
    ]);
    const done = new Promise<void>((resolve, reject) => {
      ff.on('error', reject);
      ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${this.name}: ffmpeg exited ${code}`))));
    });
    const t0 = this.frames[0]!.t;
    const at = (i: number) => Math.round(((this.frames[i]!.t - t0) * FPS) / 1000);
    const painted = this.frames.length - 1; // frames with a file
    const total = at(painted) + 1;
    let i = 0;
    let jpeg = readFileSync(this.frames[0]!.file);
    for (let k = 0; k < total; k++) {
      // Show the latest frame painted by video time k.
      let next = i;
      while (next + 1 < painted && at(next + 1) <= k) next++;
      if (next !== i) {
        i = next;
        jpeg = readFileSync(this.frames[i]!.file);
      }
      if (!ff.stdin!.write(jpeg)) await new Promise((resolve) => ff.stdin!.once('drain', resolve));
    }
    ff.stdin!.end();
    await done;
    rmSync(this.dir, { recursive: true, force: true });
    log('recorded', { who: this.name, frames: total, screencastFrames: painted, ...this.frameSize });
    return { t0, frames: total, ...this.frameSize };
  }
}

/** Width and height from a JPEG's start-of-frame marker. */
function jpegSize(jpeg: Buffer): { width: number; height: number } {
  for (let i = 2; i < jpeg.length - 9; ) {
    if (jpeg[i] !== 0xff) break;
    const marker = jpeg[i + 1]!;
    if (marker >= 0xc0 && marker <= 0xc3) return { height: jpeg.readUInt16BE(i + 5), width: jpeg.readUInt16BE(i + 7) };
    i += 2 + jpeg.readUInt16BE(i + 2);
  }
  throw new Error('screencast frame is not a baseline/progressive JPEG');
}

// ---------------------------------------------------------------------------
// Phones

interface Phone {
  who: string;
  name: string;
  context: BrowserContext;
  page: Page;
}

const PHONE_VIEWPORT = { width: 390, height: 844 };
const PRESENTER_VIEWPORT = { width: 1080, height: 1920 };
/** The hero's phone fills ~760 px of the 1080-wide reel, so 2x is plenty (and half the pixels of 3x to encode). */
const HERO_DPR = 2;
/**
 * 1x: at 1.5x the screencast's JPEG encode halves the map fly-ins' frame rate
 * (~12 fps vs ~20), and the channel list still reads fine upscaled ~3x.
 */
const PRESENTER_DPR = 1;
const scaled = (v: { width: number; height: number }, dpr: number) => ({ width: v.width * dpr, height: v.height * dpr });

async function openPhone(
  browser: Browser,
  who: string,
  profile: { name: string; make: string; color: string },
  spot: string,
  opts: { recorded?: boolean } = {},
): Promise<Phone> {
  const context = await browser.newContext({
    viewport: PHONE_VIEWPORT,
    deviceScaleFactor: opts.recorded ? HERO_DPR : 1,
    isMobile: true,
    hasTouch: true,
    locale: 'en-US',
    colorScheme: 'light',
    // Off-camera phones skip the intro animation; the hero's plays in full.
    reducedMotion: opts.recorded ? 'no-preference' : 'reduce',
    permissions: ['microphone'],
  });
  await context.exposeFunction('__chime', (file: string, t: number) => logAt(t, 'chime', { who, file }));
  const page = await context.newPage();
  await page.addInitScript(MIC_SHIM);
  await page.addInitScript(CHIME_HOOK);
  if (!opts.recorded) await page.addInitScript(STILL);
  await page.addInitScript((p) => sessionStorage.setItem('roadies.demoCar', JSON.stringify(p)), profile);
  page.on('pageerror', (err) => log('page-error', { who, message: err.message }));
  await page.goto(`${WEB}/demo?spot=${spot}`);
  return { who, name: profile.name, context, page };
}

/** Taps the "connect" card on Your jam, then waits until the server has the car in a room. */
async function join(phone: Phone): Promise<void> {
  const card = phone.page.locator('.options .option').first();
  await card.waitFor({ state: 'visible', timeout: 30_000 });
  const box = await card.boundingBox();
  // Where the finger lands (CSS px in the phone's viewport), for a tap ripple in the edit.
  if (box) log('tap', { who: phone.who, x: box.x + box.width / 2, y: box.y + box.height / 2 });
  await card.click();
  await until(`${phone.who} in a room`, (s) => !!carNamed(s, phone.name)?.roomId, 20_000);
  log('joined', { who: phone.who, room: roomOf(await state(), phone.name) });
}

/** Off-camera: tap the phone's own Unmute button (demo mode joins muted). */
async function tapUnmute(phone: Phone): Promise<void> {
  await phone.page.getByRole('button', { name: 'Unmute' }).click();
  await until(`${phone.who} unmuted`, (s) => carNamed(s, phone.name)?.state.selfMute === false, 10_000);
}

const clipB64 = new Map<string, string>();
function clip(id: LineId): string {
  let b64 = clipB64.get(id);
  if (!b64) {
    b64 = readFileSync(path.join(root, 'public', 'voices', `${id}.mp3`)).toString('base64');
    clipB64.set(id, b64);
  }
  return b64;
}

/** Plays a line into a phone's mic; resolves when the clip ends. */
async function say(phone: Phone, id: LineId, attempt = 1): Promise<void> {
  const { startedAt: start, duration } = await phone.page.evaluate((b64) => window.__say(b64), clip(id));
  log('line', { id, who: phone.who, start, end: start + duration * 1000, attempt });
}

/** Says a command line until the server shows its effect (the real recognizer can miss). */
async function command(phone: Phone, id: LineId, done: (s: WorldSnapshot) => boolean, what: string) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await say(phone, id, attempt);
    try {
      await until(what, done, 6_000);
      log('recognized', { id, who: phone.who, attempt });
      return;
    } catch {
      log('missed', { id, who: phone.who, attempt });
      await sleep(1_500);
    }
  }
  throw new Error(`${phone.who}: "${id}" was never recognized`);
}

// ---------------------------------------------------------------------------
// Server state (read-only)

async function state(): Promise<WorldSnapshot> {
  const res = await fetch(`${SERVER}/dev/state`);
  if (!res.ok) throw new Error(`/dev/state -> ${res.status}`);
  return ((await res.json()) as { snapshot: WorldSnapshot }).snapshot;
}
/** The car with this name, preferring an online one (a closed tab lingers offline for the server's 30 s grace). */
const carNamed = (s: WorldSnapshot, name: string) =>
  s.cars.find((c) => c.name === name && !c.bot && c.online) ?? s.cars.find((c) => c.name === name && !c.bot);
const roomOf = (s: WorldSnapshot, name: string) => s.rooms.find((r) => r.id === carNamed(s, name)?.roomId)?.name ?? null;

async function until(what: string, check: (s: WorldSnapshot) => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check(await state())) return;
    await sleep(150);
  }
  throw new Error(`timed out waiting for: ${what}`);
}

/** Logs every change in the cast's voice state, rooms and speaking, for placing chimes and animations. */
function watchWorld(): () => void {
  let prev = new Map<string, string>();
  let stopped = false;
  void (async () => {
    while (!stopped) {
      try {
        const s = await state();
        const next = new Map<string, string>();
        for (const c of s.cars.filter((c) => !c.bot && c.online)) {
          const room = s.rooms.find((r) => r.id === c.roomId);
          next.set(`car:${c.name}`, JSON.stringify({ room: room?.name ?? null, ...c.state }));
          next.set(`speaking:${c.name}`, String(c.speaking));
        }
        for (const r of s.rooms) {
          const merge = r.mergeInMs === null ? null : Math.ceil(r.mergeInMs / 1000);
          next.set(`room:${r.name}`, JSON.stringify({ active: r.activeCount, merge }));
        }
        for (const [k, v] of next) if (prev.get(k) !== v) log('world', { key: k, value: JSON.parse(v) });
        for (const k of prev.keys()) if (!next.has(k)) log('world', { key: k, value: null });
        prev = next;
      } catch {
        // one failed poll is fine
      }
      await sleep(200);
    }
  })();
  return () => {
    stopped = true;
  };
}

// ---------------------------------------------------------------------------
// The take

const profileOf = (id: CastId) => ({ name: CAST[id].name, make: CAST[id].make, color: CAST[id].color });
const EXTRAS = [
  { name: 'Blue RAV4', make: 'RAV4', color: 'Blue' },
  { name: 'White Model Y', make: 'Model Y', color: 'White' },
  { name: 'Orange Outback', make: 'Outback', color: 'Orange' },
];

async function main() {
  await fetch(`${SERVER}/dev/reset`, { method: 'POST' });
  const before = await state();
  if (before.cars.some((c) => !c.bot)) throw new Error('someone is still connected after reset; close other tabs');

  // Full Chromium's new headless mode rasterizes on the GPU; the default
  // headless shell uses SwiftShader, which flies the projector's map at ~8 fps.
  // Its screencast ignores a context's deviceScaleFactor, though, and only a
  // browser-wide flag gives frames at device pixels: so the two recorded pages
  // get a browser each, and the off-camera phones share a plain one.
  const launch = (dpr?: number) =>
    chromium.launch({
      headless: true,
      channel: 'chromium',
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
        ...(dpr ? [`--force-device-scale-factor=${dpr}`] : []),
      ],
    });
  const [browser, presenterBrowser, heroBrowser] = await Promise.all([launch(), launch(PRESENTER_DPR), launch(HERO_DPR)]);
  const stopWatching = watchWorld();

  // The projector, portrait, so the 101 corridor runs down the tall map.
  const presenterContext = await presenterBrowser.newContext({ viewport: PRESENTER_VIEWPORT, deviceScaleFactor: PRESENTER_DPR });
  const presenter = await presenterContext.newPage();
  await presenter.addInitScript(WARP);
  await presenter.goto(`${WEB}/presenter?key=${encodeURIComponent(PRESENTER_KEY!)}`);
  await presenter.waitForSelector('.leaflet-container');
  await prefetchTiles(presenter, 'corridor', [8, 9, 10, 11, 12].flatMap((z) => tilesAround(corridor.points, z, 1, 1)));
  const presenterRec = new Recorder('presenter', presenter);
  const presenterSize = scaled(PRESENTER_VIEWPORT, PRESENTER_DPR);
  await presenterRec.start(presenterSize.width, presenterSize.height);
  log('presenter-ready');
  await sleep(2_000);

  // Hospital Curve #1 fills up before the hero arrives.
  const cast: Partial<Record<CastId, Phone>> = {};
  for (const id of ['prius', 'tacoma', 'miata'] as const) {
    cast[id] = await openPhone(browser, id, profileOf(id), 'hospital-curve');
    await join(cast[id]!);
    await tapUnmute(cast[id]!);
    await sleep(1_200);
  }
  const { prius, tacoma, miata } = cast as Record<'prius' | 'tacoma' | 'miata', Phone>;
  await prefetchTiles(presenter, 'hospital-curve', focusTiles(carPositions(await state(), [prius.name, tacoma.name, miata.name])));
  await focusRoomInSlowMotion(presenter, 'Hospital Curve #1');
  await sleep(1_000);

  // Beat 3: the hero opens the app (intro plays), taps "connect", lands muted.
  const hero = await openPhone(heroBrowser, 'hero', profileOf('hero'), 'hospital-curve', { recorded: true });
  // The presenter holds still while the intro animation plays, so the hero's
  // screencast gets the CPU; it resumes once the "connect" card is up.
  await presenterRec.pause();
  const heroRec = new Recorder('hero', hero.page);
  const heroSize = scaled(PHONE_VIEWPORT, HERO_DPR);
  await heroRec.start(heroSize.width, heroSize.height);
  log('hero-opened');
  await hero.page.locator('.options .option').first().waitFor({ state: 'visible', timeout: 30_000 });
  await presenterRec.resume();
  log('resumed', { who: 'presenter' });
  await sleep(600);
  await join(hero);
  await sleep(2_500);

  // Beat 4: lurking.
  await say(prius, 'prius-tuesday');
  await sleep(600);
  await say(tacoma, 'tacoma-kid');
  await sleep(1_500);

  // Beat 5: "Unmute."
  await command(hero, 'hero-unmute', (s) => carNamed(s, hero.name)?.state.selfMute === false, 'hero unmuted');
  await sleep(800);
  await say(hero, 'hero-hi');
  await sleep(300);
  await Promise.all([say(prius, 'prius-hey'), sleep(250).then(() => say(tacoma, 'tacoma-hey')), sleep(450).then(() => say(miata, 'miata-hey'))]);
  await sleep(1_500);

  // Beat 6: "mute" inside a sentence does nothing; the Prius's bare "Mute." does.
  await say(miata, 'miata-sushi');
  await sleep(4_000);
  const miataStill = carNamed(await state(), miata.name);
  log('gag-check', { miataMuted: miataStill?.state.selfMute ?? null });
  if (miataStill?.state.selfMute) throw new Error('"don\'t mute me" muted the Miata: the gag is broken');
  await command(prius, 'prius-mute', (s) => carNamed(s, prius.name)?.state.selfMute === true, 'prius muted');
  await sleep(2_000);

  // Beat 7: a fifth car opens Hospital Curve #2; three more fill it so every room is full.
  const wrangler = await openPhone(browser, 'wrangler', profileOf('wrangler'), 'hospital-curve');
  await join(wrangler);
  await sleep(1_500);
  const extras: Phone[] = [];
  for (const p of EXTRAS) {
    const extra = await openPhone(browser, 'extra', p, 'hospital-curve');
    await join(extra);
    extras.push(extra);
    await sleep(800);
  }
  await sleep(2_000);

  // Beat 8: the Mustang starts alone down south (every room is full), the Prius
  // escapes the sushi story, and the merge puts the Mustang in his seat. He
  // joins once: rejoining for a better spot would leave each rejected room in
  // the projector's channel list for the 30 s ghost grace (see --loner-in).
  const mustang = await openPhone(browser, 'mustang', profileOf('mustang'), 'loner');
  await join(mustang);
  const mustangRoom = roomOf(await state(), mustang.name);
  if (LONER_IN && !mustangRoom?.startsWith(LONER_IN)) {
    log('loner-missed', { room: mustangRoom, wanted: LONER_IN });
    stopWatching();
    await Promise.all([presenterRec.stop(), heroRec.stop()]);
    await Promise.all([browser.close(), presenterBrowser.close(), heroBrowser.close()]);
    rmSync(outDir, { recursive: true, force: true });
    process.exit(LONER_MISSED);
  }
  await tapUnmute(mustang);
  await prefetchTiles(presenter, 'mustang', focusTiles(carPositions(await state(), [mustang.name])));
  if (mustangRoom) {
    await focusRoom(presenter, mustangRoom);
    // Where his channel sits in the list (CSS px), for the reel's card crop.
    const channel = presenter.locator('.channel').filter({ has: presenter.locator('.channel-name', { hasText: mustangRoom }) });
    log('loner-channel', { room: mustangRoom, ...(await channel.boundingBox()) });
  }
  await sleep(2_500);
  await say(miata, 'miata-sushi2');
  await sleep(500);
  await command(prius, 'prius-disconnect', (s) => carNamed(s, prius.name)?.state.connected === false, 'prius disconnected');
  await until('mustang merged into Hospital Curve #1', (s) => roomOf(s, mustang.name) === 'Hospital Curve #1', 25_000);
  log('mustang-merged');
  // The projector redraws a beat after the phones hear it; the reel's flash goes with what's on screen.
  const hospital1 = presenter.locator('.channel').filter({ has: presenter.locator('.channel-name', { hasText: 'Hospital Curve #1' }) });
  await hospital1.getByText(mustang.name).waitFor({ timeout: 10_000 });
  log('presenter-merged');
  await focusRoom(presenter, 'Hospital Curve #1');
  await sleep(1_500);
  await say(mustang, 'mustang-hello');
  await sleep(300);
  await say(miata, 'miata-newperson');
  await sleep(2_000);

  // Beat 9: zoom out on everything.
  await presenter.keyboard.press('f');
  log('presenter-fit');
  await sleep(6_000);

  stopWatching();
  await Promise.all([presenterRec.stop(), heroRec.stop()]);
  for (const p of [prius, tacoma, miata, hero, wrangler, mustang, ...extras]) await p.context.close();
  await presenterContext.close();
  await Promise.all([browser.close(), presenterBrowser.close(), heroBrowser.close()]);
  const presenterVideo = await presenterRec.encode();
  const heroVideo = await heroRec.encode();
  const captureLog: CaptureLog = {
    take,
    videos: {
      presenter: { file: `gen/captures/${take}/presenter.mp4`, ...presenterVideo },
      hero: { file: `gen/captures/${take}/hero.mp4`, ...heroVideo },
    },
    lines: LINES.map((l) => l.id),
    events,
  };
  writeFileSync(path.join(outDir, 'events.json'), JSON.stringify(captureLog, null, 2));
  writeFileSync(path.join(root, 'public', 'gen', 'captures', 'latest.json'), JSON.stringify({ take }, null, 2));
  console.log(`\ncapture written to ${path.relative(root, outDir)}`);

}

/**
 * Loads the projector's map tiles ahead of a fly-to, so the recording shows
 * streets instead of gray squares while Esri's tiles download. Same URLs as
 * CorridorMap.tsx, loaded as images so Leaflet's own requests hit the cache.
 */
const ESRI = 'https://services.arcgisonline.com/arcgis/rest/services/Canvas';
const TILE_LAYERS = ['World_Dark_Gray_Base', 'World_Dark_Gray_Reference'];

function tileXY(p: LatLng, z: number): [number, number] {
  const n = 2 ** z;
  const lat = (p.lat * Math.PI) / 180;
  return [
    Math.floor(((p.lng + 180) / 360) * n),
    Math.floor(((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * n),
  ];
}

/** Tiles covering `points` at zoom `z`, padded by `padX`/`padY` tiles. */
function tilesAround(points: readonly LatLng[], z: number, padX: number, padY: number): string[] {
  const xy = points.map((p) => tileXY(p, z));
  const xs = xy.map(([x]) => x);
  const ys = xy.map(([, y]) => y);
  const urls: string[] = [];
  for (let x = Math.min(...xs) - padX; x <= Math.max(...xs) + padX; x++)
    for (let y = Math.min(...ys) - padY; y <= Math.max(...ys) + padY; y++)
      for (const layer of TILE_LAYERS) urls.push(`${ESRI}/${layer}/MapServer/tile/${z}/${y}/${x}`);
  return urls;
}

async function prefetchTiles(presenter: Page, what: string, urls: string[]): Promise<void> {
  const started = Date.now();
  const failed = await presenter.evaluate(
    (list) =>
      Promise.all(
        list.map(
          (src) =>
            new Promise<number>((resolve) => {
              const img = new Image();
              img.onload = () => resolve(0);
              img.onerror = () => resolve(1);
              img.src = src;
            }),
        ),
      ).then((r) => r.reduce((a, b) => a + b, 0)),
    urls,
  );
  log('tiles', { what, count: urls.length, failed, ms: Date.now() - started });
}

/** The zooms a fly-to a spot passes through on its way to Leaflet's maxZoom 15. */
const focusTiles = (points: readonly LatLng[]) => [
  ...tilesAround(points, 15, 4, 6),
  ...tilesAround(points, 14, 3, 4),
  ...tilesAround(points, 13, 2, 3),
];
const carPositions = (s: WorldSnapshot, names: string[]) =>
  names.map((n) => carNamed(s, n)?.pos).filter((p): p is LatLng => !!p);

/** Clicks a voice channel in the projector's list, which flies the map to its members. */
async function focusRoom(presenter: Page, name: string): Promise<void> {
  await presenter.locator('.channel-name', { hasText: name }).first().click();
  log('presenter-focus', { room: name });
}

/** The projector's flyToBounds length (web/src/components/CorridorMap.tsx). */
const FLY_SECONDS = 1.2;
/** The first fly-in is recorded this many times slower; the reel plays it back as much faster. */
const SLOWMO = 4;

/**
 * `focusRoom`, with the projector's clock and CSS animations slowed for the
 * fly (logged as `slowmo`). Only for moments when nothing else on the
 * projector moves: a countdown on screen would slow down too.
 */
async function focusRoomInSlowMotion(presenter: Page, name: string): Promise<void> {
  const ms = Math.round((FLY_SECONDS * SLOWMO + 1.5) * 1000);
  const cdp = await presenter.context().newCDPSession(presenter);
  await cdp.send('Animation.enable');
  await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 / SLOWMO });
  const start = await presenter.evaluate(([factor, span]) => window.__warp(factor, span), [SLOWMO, ms] as const);
  logAt(start, 'slowmo', { factor: SLOWMO, until: start + ms });
  await focusRoom(presenter, name);
  await sleep(start + ms - Date.now());
  await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 });
  await cdp.detach();
}

await main();
