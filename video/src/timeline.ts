/**
 * Lays out the reel from a capture's event log (tools/capture.ts): the shots,
 * the audio under them and the captions over them, all in reel frames.
 *
 * A shot is either pure animation (its own clock from frame 0) or a window of
 * capture time. Capture windows carry everything that really happened in them:
 * the recordings, the voice clips the phones spoke, the Discord sounds the
 * phones played (logged as they played), and the highway animation's bubbles
 * and badges, which are pinned to capture time too. Cutting between windows is
 * like editing a multicam recording: the reel can only show what the app did,
 * when it did it.
 *
 * Capture time is counted in "capture frames": 30 per second since the
 * projector recording's first frame (`log.videos.presenter.t0`).
 */
import { BRAND, CAST, type CastId } from './cast';
import type { CaptureEvent, CaptureLog, CapturedVideo } from './capture-log';
import { LINES, type LineId } from './lines';
import type { Media } from './media';
import mediaJson from './media.json';
import type { HighwaySceneProps } from './scenes/HighwayScene';
import type { NerdSteps } from './scenes/NerdDiagram';
import type { SfxId } from './sfx';

const media = mediaJson as Media;

export const FPS = 30;

/**
 * A window of the projector, in its CSS px (1080x1920 viewport). Without `h`
 * it fills the reel (9:16, height follows); with `h` it floats as a card of
 * that shape over the blurred projector.
 */
export interface Crop {
  x: number;
  y: number;
  w: number;
  h?: number;
}

/** A crop keyframe at a capture frame; crops ease between keyframes. */
export interface CropKey {
  at: number;
  crop: Crop;
}

export type AnimScene = 'freeze' | 'vhs' | 'lonely' | 'endcard' | 'nerds';

export type Visual =
  | { kind: 'presenter'; crop: CropKey[] }
  | { kind: 'hero' }
  | { kind: 'highway' }
  | { kind: 'dashboard' }
  | { kind: 'anim'; scene: AnimScene };

export interface Shot {
  start: number;
  frames: number;
  visual: Visual;
  /** Capture frame at the shot's first frame; absent for animation. */
  from?: number;
  /** Capture frames per reel frame. */
  speed: number;
  /** Freeze on `from` for the whole shot. */
  hold: boolean;
}

export type Overlay =
  | { kind: 'meme'; from: number; to: number; lines: string[]; y?: number; size?: number; tilt?: number }
  | { kind: 'subtitle'; from: number; to: number; line: LineId; accent: string; rate: number; y: number }
  | { kind: 'flash'; from: number; to: number; color?: string }
  /** A finger tap on the hero's phone, at its CSS px (390x844 viewport). */
  | { kind: 'tap'; from: number; to: number; x: number; y: number };

export interface PlacedAudio {
  key: string;
  /** Path under public/. */
  src: string;
  from: number;
  /** Frames to play (the clip is cut there). */
  frames: number;
  volume: number;
  rate: number;
}

export interface Timeline {
  shots: Shot[];
  overlays: Overlay[];
  audio: PlacedAudio[];
  /** Reel frame ranges under the traffic ambience. */
  bed: { from: number; to: number }[];
  duration: number;
  videos: CaptureLog['videos'];
  /** Where each recording's frame 0 falls, in capture frames. */
  videoOffset: { presenter: number; hero: number };
  /** Highway props, in capture frames. */
  highway: HighwaySceneProps;
  /** Beat 1's frozen jam, in its own frames. */
  freeze: HighwaySceneProps;
  /** Dashboard props, in capture frames. */
  dashboard: { sayBubble: { text: string; from: number; to: number }; boomAt: number };
  /** The VHS rewind lands on the projector at `land` (capture frame) on its frame `settle`. */
  vhs: { settle: number; land: number; crop: CropKey[] };
  /** Where the lone Mustang started (the room's place name). */
  lonerPlace: string;
  nerdSteps: Partial<NerdSteps>;
}

/** Something heard in capture time. */
interface Cue {
  key: string;
  at: number;
  src: string;
  seconds: number;
  volume: number;
  line?: LineId;
}

type LineDef = (typeof LINES)[number];
const lineById = new Map<string, LineDef>(LINES.map((l) => [l.id, l]));
const phoneOf = (id: LineId): CastId | undefined => {
  const l = lineById.get(id)!;
  return 'phone' in l ? l.phone : undefined;
};
const clipSeconds = (id: LineId) => media.voices[id]!.duration;
const sfxSeconds = (id: SfxId) => media.sfx[id]!.duration;

/** Levels in the mix. The app plays its sounds at 0.6 (web/src/lib/chimes.ts). */
export const VOLUME = { voice: 1, chime: 0.6, sfx: 0.5, bed: 0.1 };

/** Seconds of a Discord sound (web/public/audio) to play: all of any of them. */
const CHIME_SECONDS = 2;

/** Lines spoken over each other; the highway's bubbles caption them instead of subtitles. */
const CHORUS = new Set<LineId>(['prius-hey', 'tacoma-hey', 'miata-hey']);

/** VhsRewind's settle frame (its default). */
const VHS_SETTLE = 60;

// Projector crops, in its CSS px; tuned against the recordings.
const FULL: Crop = { x: 0, y: 0, w: 1080 };
/** Hospital Curve's dots after the projector focuses the room. */
const HOSPITAL: Crop = { x: 470, y: 560, w: 470 };
/** Hospital Curve #1 and #2 in the channel list. */
const CHANNELS: Crop = { x: 72, y: 88, w: 280, h: 380 };
/** The channel list down past the Mustang's lone room, if the capture didn't log where it sits. */
const LONER: Crop = { x: 72, y: 88, w: 280, h: 290 };

/** Frame into a voice line where a word starts. */
function wordFrame(id: LineId, word: string): number {
  const w = media.voices[id]!.words.find((x) => x.text.toLowerCase().startsWith(word));
  if (!w) throw new Error(`"${word}" is not in ${id}`);
  return Math.round(w.start * FPS);
}

export function buildTimeline(log: CaptureLog): Timeline {
  const anchor = log.videos.presenter.t0;
  const cf = (epochMs: number) => ((epochMs - anchor) * FPS) / 1000;
  const events = log.events;

  // ---- what happened ------------------------------------------------------------

  type LineEvent = CaptureEvent & { id: LineId; start: number; end: number };
  const lineEvents = events.filter((e) => e.kind === 'line') as LineEvent[];
  /** A line's last take (a command repeated after a miss counts as its final attempt). */
  const line = (id: LineId) => {
    const e = lineEvents.filter((l) => l.id === id).at(-1);
    if (!e) throw new Error(`capture has no line ${id}`);
    return { start: cf(e.start), end: cf(e.end) };
  };
  const logged = (kind: string, test: (e: CaptureEvent) => boolean = () => true) => {
    const e = events.filter((x) => x.kind === kind && test(x)).at(-1);
    if (!e) throw new Error(`capture has no matching ${kind} event`);
    return e;
  };
  const chimeAt = (who: string, file: string, after = -Infinity) => {
    const e = events.find((x) => x.kind === 'chime' && x.who === who && x.file === file && cf(x.t) > after);
    if (!e) throw new Error(`the ${who} phone never played ${file}`);
    return cf(e.t);
  };

  const heroOpened = cf(logged('hero-opened').t);
  const heroTap = logged('tap', (e) => e.who === 'hero');
  const tapAt = cf(heroTap.t);
  const heroJoined = cf(logged('joined', (e) => e.who === 'hero').t);
  const heroUnmuted = chimeAt('hero', 'unmute');
  const priusMuted = chimeAt('prius', 'mute');
  const wranglerJoined = cf(logged('joined', (e) => e.who === 'wrangler').t);
  const lastExtra = cf(logged('joined', (e) => e.who === 'extra').t);
  const lonerJoin = logged('joined', (e) => e.who === 'mustang');
  const lonerJoined = cf(lonerJoin.t);
  const lonerRoom = String(lonerJoin.room);
  const place = lonerRoom.replace(/\s*#\d+$/, '');
  const priusLeft = chimeAt('hero', 'user_leave');
  const mustangMerged = chimeAt('mustang', 'user_moved');
  const focusHospital = cf(logged('presenter-focus', (e) => e.room === 'Hospital Curve #1' && cf(e.t) < heroOpened).t);
  const fit = cf(logged('presenter-fit').t);
  const slowmo = logged('slowmo');
  const warp = { factor: Number(slowmo.factor) };
  const warpStart = cf(slowmo.t);
  const warpEnd = cf(Number(slowmo.until));

  // ---- capture-time audio -------------------------------------------------------

  const cues: Cue[] = lineEvents.map((e, i) => ({
    key: `line-${e.id}-${i}`,
    at: cf(e.start),
    src: `voices/${e.id}.mp3`,
    seconds: clipSeconds(e.id),
    volume: VOLUME.voice,
    line: e.id,
  }));
  // The reel hears the hero's phone (their POV), plus the sounds the story turns
  // on from other phones: the room hearing the hero join (the joiner's own
  // phone plays nothing), the Prius's own "mute", and the Mustang being moved.
  const heard = (e: CaptureEvent) =>
    e.who === 'hero' ||
    (e.who === 'prius' && e.file === 'mute') ||
    (e.who === 'prius' && e.file === 'user_join' && Math.abs(cf(e.t) - heroJoined) < 15) ||
    (e.who === 'mustang' && e.file === 'user_moved');
  for (const e of events) {
    if (e.kind !== 'chime' || !heard(e)) continue;
    cues.push({ key: `chime-${e.who}-${e.file}-${e.t}`, at: cf(e.t), src: `gen/app-audio/${e.file}.mp3`, seconds: CHIME_SECONDS, volume: VOLUME.chime });
  }

  // ---- layout ---------------------------------------------------------------------

  const shots: Shot[] = [];
  const overlays: Overlay[] = [];
  const audio: PlacedAudio[] = [];
  const bed: { from: number; to: number }[] = [];
  const played = new Set<string>();
  let now = 0;

  const subtitleY = (visual: Visual) => (visual.kind === 'hero' ? 1170 : 1200);

  /** A window of capture time [from, to), optionally sped up; plays the cues that start in it. */
  const capture = (from: number, to: number, visual: Visual, speed = 1) => {
    const frames = Math.max(1, Math.round((to - from) / speed));
    const start = now;
    shots.push({ start, frames, visual, from, speed, hold: false });
    for (const c of cues) {
      if (played.has(c.key) || c.at < from || c.at >= to) continue;
      played.add(c.key);
      const at = start + Math.round((c.at - from) / speed);
      const len = Math.ceil((c.seconds * FPS) / speed);
      audio.push({ key: c.key, src: c.src, from: at, frames: len, volume: c.volume, rate: speed });
      if (c.line && !CHORUS.has(c.line)) {
        const phone = phoneOf(c.line);
        overlays.push({
          kind: 'subtitle',
          from: at,
          to: at + len + 8,
          line: c.line,
          accent: phone ? CAST[phone].hex : BRAND.orange,
          rate: speed,
          y: subtitleY(visual),
        });
      }
    }
    now += frames;
    return { start, end: now, at: (capFrame: number) => start + Math.round((capFrame - from) / speed) };
  };
  /** Holds one capture instant; its sounds wait. */
  const hold = (at: number, frames: number, visual: Visual) => {
    const start = now;
    shots.push({ start, frames, visual, from: at, speed: 1, hold: true });
    now += frames;
    return { start, end: now };
  };
  const anim = (scene: AnimScene, frames: number) => {
    const start = now;
    shots.push({ start, frames, visual: { kind: 'anim', scene }, speed: 1, hold: false });
    now += frames;
    return { start, end: now };
  };
  /** Voice-over at a reel frame, with subtitles; returns where it ends. */
  const vo = (id: LineId, at: number, y = 1200) => {
    const len = Math.ceil(clipSeconds(id) * FPS);
    audio.push({ key: `vo-${id}`, src: `voices/${id}.mp3`, from: at, frames: len, volume: VOLUME.voice, rate: 1 });
    overlays.push({ kind: 'subtitle', from: at, to: at + len + 8, line: id, accent: BRAND.orange, rate: 1, y });
    return at + len;
  };
  const sfx = (id: SfxId, at: number, volume: number = VOLUME.sfx) =>
    audio.push({ key: `sfx-${id}-${at}`, src: `sfx/${id}.mp3`, from: at, frames: Math.ceil(sfxSeconds(id) * FPS), volume, rate: 1 });
  const meme = (from: number, to: number, lines: string[], opts: { y?: number; size?: number; tilt?: number } = {}) =>
    overlays.push({ kind: 'meme', from, to, lines, ...opts });
  const presenter = (...keys: [number, Crop][]): Visual => ({ kind: 'presenter', crop: keys.map(([at, crop]) => ({ at, crop })) });

  // 1. Freeze frame: "yep, that's me". ---------------------------------------------
  const FREEZE_AT = 18;
  const introEnd = vo('n-intro', FREEZE_AT + 12);
  const s1 = anim('freeze', introEnd + 8);
  sfx('scratch', FREEZE_AT, 0.7);
  bed.push({ from: 0, to: FREEZE_AT });
  meme(0, s1.end, ['POV: the 101 has a voice chat now'], { y: 210, size: 52 });
  meme(FREEZE_AT + 8, s1.end, ["yep that's me 🚗", '(the teal one)'], { y: 310, size: 46, tilt: -3 });

  // 2. VHS rewind to forty minutes earlier; it lands on the projector flying into
  // Hospital Curve (the cars there, not moving). The capture recorded the fly in
  // slow motion (`slowmo`) for a smooth frame rate; it plays back at real speed.
  const land = warpStart - 14;
  const flyCrop: CropKey[] = [
    { at: land, crop: FULL },
    { at: focusHospital + 6 * warp.factor, crop: FULL },
    { at: focusHospital + 40 * warp.factor, crop: HOSPITAL },
  ];
  const s2 = anim('vhs', warpStart - land + VHS_SETTLE);
  sfx('rewind', s2.start);
  const earlierEnd = vo('n-earlier', s2.start + 12);
  const flyIn: Visual = { kind: 'presenter', crop: flyCrop };
  const sixAt = s2.start + 12 + wordFrame('n-earlier', 'six');
  const fly = capture(warpStart, warpEnd, flyIn, warp.factor);
  const s3 = capture(warpEnd, warpEnd + Math.max(earlierEnd + 10, sixAt + 60) - fly.end, flyIn);
  meme(sixAt, s3.end, ['6 ft in 40 min 💀'], { y: 230, size: 64 });

  // 3. The hero opens Roadies and taps "connect"; a teal dot joins the map. ---------
  const intro = capture(heroOpened + 4, tapAt - 16, { kind: 'hero' }, 1.8);
  const tap = capture(tapAt - 16, tapAt + 8, { kind: 'hero' });
  overlays.push({ kind: 'tap', from: tap.at(tapAt) - 3, to: tap.at(tapAt) + 16, x: Number(heroTap.x), y: Number(heroTap.y) });
  const s5 = capture(tapAt + 8, heroJoined + 48, presenter([0, HOSPITAL]));
  meme(intro.start + 6, s5.end, ["discord voice chat but it's only", 'people stuck in your traffic'], { y: 200, size: 46 });
  bed.push({ from: s2.end, to: s5.end });

  // 4. Lurking, muted. ------------------------------------------------------------
  const tuesday = line('prius-tuesday');
  const kid = line('tacoma-kid');
  const s6 = capture(tuesday.start - 14, kid.start - 4, { kind: 'hero' });
  const s6b = capture(kid.start - 4, kid.end + 10, { kind: 'highway' });
  meme(s6.start + 24, s6b.end, ['the lore in here is insane'], { y: 220 });

  // 5. "Unmute." Hands on the wheel; the phone flips. --------------------------------
  const unmute = line('hero-unmute');
  const hi = line('hero-hi');
  const heys = [line('prius-hey'), line('tacoma-hey'), line('miata-hey')];
  const heysEnd = Math.max(...heys.map((h) => h.end));
  const s7 = capture(unmute.start - 24, hi.start + 12, { kind: 'dashboard' });
  sfx('boom', s7.at(heroUnmuted), 0.45);
  meme(s7.at(heroUnmuted) + 4, s7.end + 45, ["didn't touch my phone.", 'just said "unmute" 🗣️'], { y: 1340, size: 46 });
  const s7b = capture(hi.start + 12, heysEnd + 14, { kind: 'highway' });

  // 6. The gag: "mute" inside a sentence does nothing; the Prius's bare "Mute." does.
  const sushi = line('miata-sushi');
  const s8 = capture(sushi.start - 8, sushi.end + 4, { kind: 'highway' });
  const s8b = hold(sushi.end + 4, 84, { kind: 'highway' });
  sfx('scratch', s8b.start, 0.5);
  meme(s8b.start + 2, s8b.end, ['she said "mute"…', 'nothing happened 👀'], { y: 220 });
  meme(s8b.start + 26, s8b.end, ["(it only counts if that's ALL you say)"], { y: 1340, size: 40 });
  const mute = line('prius-mute');
  const s8c = capture(mute.start - 10, priusMuted + 45, { kind: 'highway' });
  meme(s8c.at(priusMuted) + 2, s8c.end, ['prius said no 💀'], { y: 230, size: 64, tilt: 2 });
  bed.push({ from: s5.end, to: s8c.end });

  // 7. A fifth car: rooms hold 4, so the app opens Hospital Curve #2. -----------------
  const s9 = capture(wranglerJoined - 50, wranglerJoined - 2, { kind: 'highway' });
  const s9b = capture(wranglerJoined - 2, wranglerJoined + 40, presenter([0, CHANNELS]));
  sfx('pop', s9b.at(wranglerJoined) + 3, 0.45);
  // The extras fill it at whatever pace the take had; that plays in about 3 s.
  const fillFrom = wranglerJoined + 40;
  const fillTo = lastExtra + 24;
  const s9c = capture(fillFrom, fillTo, presenter([0, CHANNELS]), Math.max(3, Math.ceil((fillTo - fillFrom) / 90)));
  meme(s9.start + 8, s9c.end, ['max 4 per room so the app', 'just… opened another room 🏠'], { y: 200, size: 46 });
  bed.push({ from: s8c.end, to: s9c.end });

  // 8. The Prius escapes the sushi; the lonely Mustang gets his seat. -----------------
  const sushi2 = line('miata-sushi2');
  const disconnect = line('prius-disconnect');
  // The merge can follow the Prius leaving within a second: the highway stops
  // short of it (its chimes belong to the projector's merge below), holding
  // still if that leaves "prius LEFT" too short to read.
  const s10To = Math.min(priusLeft + 40, mustangMerged - 3);
  const s10 = capture(sushi2.start - 8, s10To, { kind: 'highway' });
  const shortBy = 42 - (s10.end - s10.at(priusLeft));
  const s10End = shortBy > 0 ? hold(s10To - 1, shortBy, { kind: 'highway' }).end : s10.end;
  meme(s10.at(priusLeft) + 2, s10End + 4, ['prius LEFT 💀💀'], { y: 230, size: 66, tilt: -2 });
  bed.push({ from: s10.start, to: s10End });
  const lonely = anim('lonely', 84);
  sfx('violin', lonely.start, 0.5);
  meme(lonely.start + 6, lonely.end, ['meanwhile. a gold mustang.', `alone. in ${place.toLowerCase()} 🥲`], { y: 210, size: 50 });
  // Meanwhile on the projector: his real countdown, sped up, then the merge at 1x.
  const lonerChannel = events.find((e) => e.kind === 'loner-channel');
  const lonerCard: Crop = lonerChannel
    ? { ...LONER, h: Math.max(LONER.h!, Number(lonerChannel.y) + Number(lonerChannel.height) + 12 - LONER.y) }
    : LONER;
  const countFrom = lonerJoined + 45;
  const countTo = mustangMerged - 20;
  const count = capture(countFrom, countTo, presenter([0, lonerCard]), Math.max(4, Math.ceil((countTo - countFrom) / 100)));
  sfx('tick', count.start, 0.3);
  // The phones chime the merge; the projector shows it a beat later (`presenter-merged`).
  const shown = events.find((e) => e.kind === 'presenter-merged');
  const mergeShown = shown ? cf(shown.t) : mustangMerged;
  const merge = capture(mustangMerged - 20, mergeShown + 45, presenter([0, lonerCard]));
  const merged = merge.at(mergeShown);
  sfx('whoosh', merged - 10, 0.6);
  overlays.push({ kind: 'flash', from: merged, to: merged + 8 });
  const hello = line('mustang-hello');
  const newPerson = line('miata-newperson');
  // Jump-cuts any wait between the two lines (a loaded machine can stall the take).
  const helloTo = hello.end + 12;
  const s10f = capture(hello.start - 12, helloTo, { kind: 'hero' });
  const s10g = capture(Math.max(helloTo, newPerson.start - 10), newPerson.end + 16, { kind: 'hero' });
  meme(s10g.at(newPerson.start) + 6, s10g.end, ["he took the prius's seat.", "he doesn't know about the sushi 💀"], { y: 200, size: 46 });
  bed.push({ from: merge.start, to: s10g.end });

  // 9. Zoom out on every room. ---------------------------------------------------------
  const endingLen = Math.ceil(clipSeconds('n-ending') * FPS);
  const s11 = capture(fit - 6, fit - 6 + endingLen + 24, presenter([0, FULL]));
  vo('n-ending', s11.start + 10);
  bed.push({ from: s11.start, to: s11.end });
  const end = anim('endcard', 105);
  sfx('pop', end.start + 10, 0.4);

  // Part 2 for the nerds (the diagram draws its own title). ---------------------------
  const NERD_VO = 12;
  const nerds = anim('nerds', NERD_VO + Math.ceil(clipSeconds('n-nerds') * FPS) + 36);
  vo('n-nerds', nerds.start + NERD_VO, 1480);
  const w = (word: string) => NERD_VO + wordFrame('n-nerds', word);
  const nerdSteps: Partial<NerdSteps> = {
    title: 0,
    room: w('every') - 6,
    phones: w('every') + 6,
    peerLines: w('has'),
    bot: w('hidden'),
    earLines: w('listening'),
    speak: w('google') - 16,
    stt: w('google'),
    chip: w('into'),
    server: w('commands'),
    check: w('commands') + 22,
    muteTrick: w('mute'),
    label: w('only'),
  };

  // ---- highway + dashboard props, in capture frames ---------------------------------

  const speaking: NonNullable<HighwaySceneProps['speaking']> = [];
  for (const e of lineEvents) {
    const phone = phoneOf(e.id);
    if (phone) speaking.push({ id: phone, from: Math.round(cf(e.start)), to: Math.round(cf(e.end)) });
  }
  const bubble = (id: LineId, text: string) => {
    const l = line(id);
    return { id: phoneOf(id)!, text, from: Math.round(l.start), to: Math.round(l.end) + 12 };
  };
  const cam = (at: number, focus: CastId | 'all', zoom: number) => ({ at: Math.round(at), focus, zoom });
  const highway: HighwaySceneProps = {
    cast: ['hero', 'prius', 'tacoma', 'miata'],
    arrivals: [{ id: 'wrangler', at: Math.round(wranglerJoined - 44) }],
    inCall: ['hero', 'prius', 'tacoma', 'miata'],
    speaking,
    bubbles: [
      bubble('tacoma-kid', 'do we live here now? 🏠'),
      bubble('hero-hi', 'hi 👋'),
      bubble('prius-hey', 'hey.'),
      bubble('tacoma-hey', 'heyyy'),
      bubble('miata-hey', 'heyyyy!'),
      bubble('miata-sushi', "DON'T mute me 🍣"),
      bubble('prius-mute', 'mute.'),
      bubble('miata-sushi2', 'back to the sushi 🍣'),
      bubble('prius-disconnect', 'disconnect.'),
    ],
    muted: [{ id: 'prius', from: Math.round(priusMuted) }],
    leftCall: [{ id: 'prius', from: Math.round(priusLeft) }],
    camera: [
      cam(kid.start - 4, 'tacoma', 1.15),
      cam(kid.end + 10, 'tacoma', 1.2),
      cam(hi.start + 12, 'hero', 1.1),
      cam(hi.end, 'hero', 1.1),
      cam(hi.end + 10, 'all', 1),
      cam(heysEnd + 14, 'all', 1),
      cam(sushi.start - 8, 'miata', 1.2),
      cam(sushi.end + 4, 'miata', 1.2),
      cam(mute.start - 10, 'prius', 1.2),
      cam(priusMuted + 45, 'prius', 1.2),
      cam(wranglerJoined - 50, 'all', 1),
      cam(wranglerJoined, 'all', 1),
      cam(sushi2.start - 8, 'miata', 1.15),
      cam(sushi2.end, 'miata', 1.15),
      cam(disconnect.start - 6, 'prius', 1.2),
      cam(priusLeft + 40, 'prius', 1.2),
    ],
  };
  // Beat 1 is the end of the story: the Prius gone, the rest in the call.
  const freeze: HighwaySceneProps = {
    cast: ['hero', 'prius', 'tacoma', 'miata'],
    inCall: ['hero', 'tacoma', 'miata'],
    freezeAt: FREEZE_AT,
    camera: [cam(0, 'all', 1), cam(FREEZE_AT, 'hero', 1.2)],
  };
  const dashboard = {
    sayBubble: { text: 'unmute.', from: Math.round(unmute.start), to: Math.round(unmute.end) + 16 },
    boomAt: Math.round(heroUnmuted),
  };
  const offset = (v: CapturedVideo) => ((v.t0 - anchor) * FPS) / 1000;

  return {
    shots,
    overlays,
    audio,
    bed: mergeRanges(bed),
    duration: now,
    videos: log.videos,
    videoOffset: { presenter: offset(log.videos.presenter), hero: offset(log.videos.hero) },
    highway,
    freeze,
    dashboard,
    vhs: { settle: VHS_SETTLE, land, crop: flyCrop },
    lonerPlace: place,
    nerdSteps,
  };
}

function mergeRanges(ranges: { from: number; to: number }[]) {
  const sorted = [...ranges].sort((a, b) => a.from - b.from);
  const out: { from: number; to: number }[] = [];
  for (const r of sorted) {
    const last = out.at(-1);
    if (last && r.from <= last.to) last.to = Math.max(last.to, r.to);
    else out.push({ ...r });
  }
  return out;
}

/** The crop at a capture frame, eased between keyframes. */
export function cropAt(keys: CropKey[], at: number): Crop {
  const first = keys[0]!;
  if (keys.length === 1 || at <= first.at) return first.crop;
  const next = keys.findIndex((k) => k.at > at);
  if (next === -1) return keys.at(-1)!.crop;
  const a = keys[next - 1]!;
  const b = keys[next]!;
  const t = (at - a.at) / (b.at - a.at);
  const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2; // ease in-out cubic
  const mix = (p: number, q: number) => p + (q - p) * e;
  return { x: mix(a.crop.x, b.crop.x), y: mix(a.crop.y, b.crop.y), w: mix(a.crop.w, b.crop.w), h: a.crop.h };
}
