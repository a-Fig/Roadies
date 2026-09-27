// The main set: a stylized US-101 NB morning jam, side view, traffic flowing
// right (north). Named cast cars sit in fixed slots among filler traffic;
// everything creeps in a stop-and-go wave. Props drive who talks, mutes,
// leaves the call, where the camera looks, and the beat-1 freeze frame.
import { AbsoluteFill, Easing, interpolate, random, spring, useVideoConfig } from 'remotion';
import { BRAND, CAST, type CastId } from '../cast';
import { useFrame } from '../clock';
import { CarArt, carHeight, SPEAKING_GREEN } from '../components/CarArt';
import { FONT } from '../components/fonts';
import { HeadphonesGlyph } from '../components/icons';
import { ASPHALT, FreewaySign, Hills, NorthboundSignContent, Sky, Sun } from '../components/Scenery';
import { SpeechBubble } from '../components/SpeechBubble';
import { popIn, popWindow, progress, shakeAt } from '../fx/anim';
import { Flash } from '../fx';

export interface HighwaySceneProps {
  /** Cast in the jam from frame 0. Default hero, prius, tacoma, miata. */
  cast?: CastId[];
  /** Cast that roll in from the left and stop in their slot, e.g. the Wrangler. */
  arrivals?: { id: CastId; at: number }[];
  /** Who wears the green in-call headset badge. Default: the initial `cast`. */
  inCall?: CastId[];
  /** Discord-green speaking outline, per [from, to) range. */
  speaking?: { id: CastId; from: number; to: number }[];
  /** Speech bubbles over a car, [from, to). */
  bubbles?: { id: CastId; text: string; from: number; to: number }[];
  /** Brake-red mic-slash badge pops on at `from`. */
  muted?: { id: CastId; from: number }[];
  /** The headset badge flies off at `from` ("left the call"); the car stays in traffic. */
  leftCall?: { id: CastId; from: number }[];
  /** Camera keyframes, eased between: look at a cast car (or the whole jam) at a zoom. */
  camera?: { at: number; focus: CastId | 'all'; zoom: number }[];
  /** Beat 1: freeze everything, desaturate all but the hero, flash, shake, draw the "me" arrow. */
  freezeAt?: number;
  /** Name tags on cast cars. Default true. */
  showTags?: boolean;
}

interface Lane {
  base: number; // y of the wheels' bottom
  w: number; // car width
  step: number; // slot spacing
  origin: number; // x of slot 0's center
  phase: number; // stop-and-go wave delay, frames
}

const LANES: Lane[] = [
  { base: 770, w: 230, step: 252, origin: 290, phase: 0 }, // far lane
  { base: 945, w: 275, step: 297, origin: 360, phase: 16 }, // middle
  { base: 1135, w: 325, step: 347, origin: 540, phase: 32 }, // near lane
];

const SLOTS: Record<CastId, { lane: number; k: number }> = {
  hero: { lane: 2, k: 0 },
  prius: { lane: 1, k: 0 },
  tacoma: { lane: 1, k: 1 },
  miata: { lane: 0, k: 2 },
  wrangler: { lane: 0, k: 0 },
  mustang: { lane: 0, k: 1 },
};

const FILLER = ['#c9bfb5', '#9fb3c8', '#e0c38c', '#b7a1c9', '#8fb9a8', '#d9a58f', '#e7e2d6', '#7f8a93', '#c6d2c0'];
const K_RANGE = [-6, 8] as const;
const CYCLE = 110;
const CREEP = 26;
const ANCHOR = { x: 540, y: 900 };
const ALL_FOCUS = { x: 540, y: 900 };

/** Stop-and-go: how far a car in `lane` has crept by motion-frame `mf`, and whether it's moving. */
function creep(lane: Lane, mf: number, jitter: number): { dx: number; moving: number } {
  const t = mf - lane.phase - jitter;
  if (t < 0) return { dx: 0, moving: 0 };
  const n = Math.floor(t / CYCLE);
  const within = t - n * CYCLE;
  const part = within < CREEP ? Easing.inOut(Easing.cubic)(within / CREEP) : 1;
  const dist = 16 * (lane.w / 325);
  return { dx: dist * (n + part), moving: within < CREEP ? Math.sin((Math.PI * within) / CREEP) : 0 };
}

interface Car {
  key: string;
  castId?: CastId;
  lane: number;
  x: number; // slot center x
  color: string;
  jitter: number;
}

function buildCars(present: Set<CastId>, arriving: Set<CastId>): Car[] {
  const bySlot = new Map<string, CastId>();
  for (const id of Object.keys(SLOTS) as CastId[]) bySlot.set(`${SLOTS[id].lane}:${SLOTS[id].k}`, id);
  const cars: Car[] = [];
  LANES.forEach((lane, li) => {
    for (let k = K_RANGE[0]; k <= K_RANGE[1]; k++) {
      const castId = bySlot.get(`${li}:${k}`);
      const x = lane.origin + k * lane.step;
      if (castId && (present.has(castId) || arriving.has(castId))) {
        cars.push({ key: castId, castId, lane: li, x, color: CAST[castId].hex, jitter: 0 });
      } else {
        // Strangers fill every other slot, including absent cast members' spots.
        const color = FILLER[Math.floor(random(`c${li}${k}`) * FILLER.length)]!;
        cars.push({ key: `f${li}:${k}`, lane: li, x, color, jitter: random(`j${li}${k}`) * 10 });
      }
    }
  });
  return cars;
}

export function HighwayScene({
  cast = ['hero', 'prius', 'tacoma', 'miata'],
  arrivals = [],
  inCall,
  speaking = [],
  bubbles = [],
  muted = [],
  leftCall = [],
  camera = [{ at: 0, focus: 'all', zoom: 1 }],
  freezeAt,
  showTags = true,
}: HighwaySceneProps) {
  const frame = useFrame();
  const { fps } = useVideoConfig();
  const frozen = freezeAt !== undefined && frame >= freezeAt;
  const mf = frozen ? freezeAt! : frame; // motion time stops at the freeze
  const callers = new Set(inCall ?? cast);
  const cars = buildCars(new Set(cast), new Set(arrivals.map((a) => a.id)));

  // Where each car is right now (world px).
  const place = (car: Car) => {
    const lane = LANES[car.lane]!;
    const c = creep(lane, mf, car.jitter);
    const arrival = car.castId ? arrivals.find((a) => a.id === car.castId) : undefined;
    let ax = 0;
    let arriving = 0;
    if (arrival) {
      const s = mf < arrival.at ? 0 : spring({ frame: mf - arrival.at, fps, config: { damping: 15, stiffness: 90 } });
      ax = -(1 - s) * 1100;
      arriving = mf < arrival.at ? -1 : 1 - s;
    }
    const h = carHeight(lane.w);
    return { cx: car.x + c.dx + ax, top: lane.base - h, w: lane.w, h, moving: c.moving, arriving };
  };

  // Camera: eased between keyframes; a cast focus follows that car.
  const focusPoint = (f: CastId | 'all') => {
    if (f === 'all') return ALL_FOCUS;
    const car = cars.find((c) => c.castId === f);
    if (!car) return ALL_FOCUS;
    const p = place(car);
    return { x: p.cx, y: p.top + p.h / 2 };
  };
  const cams = [...camera].sort((a, b) => a.at - b.at);
  let cam = { ...focusPoint(cams[0]!.focus), z: cams[0]!.zoom };
  for (let i = 1; i < cams.length; i++) {
    const a = cams[i - 1]!;
    const b = cams[i]!;
    if (frame <= a.at) break;
    const t = interpolate(frame, [a.at, b.at], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) });
    const pa = focusPoint(a.focus);
    const pb = focusPoint(b.focus);
    cam = { x: pa.x + (pb.x - pa.x) * t, y: pa.y + (pb.y - pa.y) * t, z: a.zoom + (b.zoom - a.zoom) * t };
  }

  // Freeze punch-in around the hero.
  const heroCar = cars.find((c) => c.castId === 'hero');
  const heroP = heroCar ? place(heroCar) : null;
  const toScreenRaw = (x: number, y: number) => ({ x: (x - cam.x) * cam.z + ANCHOR.x, y: (y - cam.y) * cam.z + ANCHOR.y });
  const heroS = heroP ? toScreenRaw(heroP.cx, heroP.top + heroP.h / 2) : { x: 540, y: 960 };
  const punch = frozen ? 1 + 0.12 * popIn(frame, freezeAt!, fps, 10) : 1;
  const toScreen = (x: number, y: number) => {
    const s = toScreenRaw(x, y);
    return { x: heroS.x + (s.x - heroS.x) * punch, y: heroS.y + (s.y - heroS.y) * punch };
  };
  const gray = frozen ? 1 : 0;
  const shake = freezeAt !== undefined ? shakeAt(frame, freezeAt, 12, 20) : { x: 0, y: 0, r: 0 };

  const ordered = [...cars].sort((a, b) => a.lane - b.lane || a.x - b.x);

  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: BRAND.cream }}>
      <AbsoluteFill style={{ transform: `translate(${shake.x}px, ${shake.y}px) rotate(${shake.r}deg)` }}>
        <AbsoluteFill style={{ filter: gray ? 'grayscale(1) contrast(1.05)' : undefined }}>
          <Sky />
        </AbsoluteFill>
        <AbsoluteFill style={{ transformOrigin: `${heroS.x}px ${heroS.y}px`, transform: `scale(${punch})` }}>
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              transformOrigin: '0 0',
              transform: `translate(${ANCHOR.x}px, ${ANCHOR.y}px) scale(${cam.z}) translate(${-cam.x}px, ${-cam.y}px)`,
            }}
          >
            <div style={{ position: 'absolute', left: 0, top: 0, filter: gray ? 'grayscale(1) contrast(1.05)' : undefined }}>
              <Sun x={210} y={330} />
              <Hills left={-1400} width={4000} bottom={700} height={300} color="#cfe5e1" seed="far" bumps={14} />
              <Hills left={-1400} width={4000} bottom={705} height={170} color="#ead7a4" seed="near" bumps={18} trees={40} />
              <FreewaySign x={560} y={170} width={430} postBottom={705}>
                <NorthboundSignContent />
              </FreewaySign>
              {/* Road: far shoulder, lanes, near shoulder, guardrail, verge. */}
              <div style={{ position: 'absolute', left: -1400, top: 690, width: 4000, height: 480, background: ASPHALT }} />
              <div style={{ position: 'absolute', left: -1400, top: 700, width: 4000, height: 6, background: BRAND.cream, opacity: 0.8 }} />
              {[808, 985].map((y) => (
                <div
                  key={y}
                  style={{
                    position: 'absolute',
                    left: -1400,
                    top: y,
                    width: 4000,
                    height: 7,
                    backgroundImage: `repeating-linear-gradient(90deg, ${BRAND.cream} 0 70px, transparent 70px 150px)`,
                    opacity: 0.75,
                  }}
                />
              ))}
              <div style={{ position: 'absolute', left: -1400, top: 1152, width: 4000, height: 6, background: BRAND.cream, opacity: 0.8 }} />
              <div style={{ position: 'absolute', left: -1400, top: 1170, width: 4000, height: 900, background: 'linear-gradient(180deg, #b9c98f, #8fa66b)' }} />
              <div style={{ position: 'absolute', left: -1400, top: 1178, width: 4000, height: 26, background: '#c9cdd1', borderBottom: '6px solid #9ea3a8' }} />
              {Array.from({ length: 40 }, (_, i) => (
                <div key={i} style={{ position: 'absolute', left: -1400 + i * 100 + 40, top: 1200, width: 12, height: 60, background: '#9ea3a8' }} />
              ))}
              {/* Verge: shrubs and California poppies (brand orange). */}
              {Array.from({ length: 34 }, (_, i) => {
                const x = -1400 + i * 120 + random(`bx${i}`) * 60;
                const r = 34 + random(`br${i}`) * 26;
                return (
                  <div
                    key={`b${i}`}
                    style={{ position: 'absolute', left: x, top: 1300 - r, width: r * 2.2, height: r * 1.3, borderRadius: '50% 50% 20% 20%', background: i % 3 ? '#6f8f55' : '#5e7f4a' }}
                  />
                );
              })}
              {Array.from({ length: 90 }, (_, i) => (
                <div
                  key={`p${i}`}
                  style={{
                    position: 'absolute',
                    left: -1400 + random(`px${i}`) * 4000,
                    top: 1300 + random(`py${i}`) * 160,
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    background: BRAND.orange,
                    boxShadow: `0 0 0 4px #f7a15f`,
                  }}
                />
              ))}
            </div>

            {ordered.map((car) => {
              const p = place(car);
              if (p.arriving === -1) return null;
              const isCast = !!car.castId;
              const g = gray && car.castId !== 'hero' ? 1 : 0;
              const speak = car.castId ? speakingLevel(frame, speaking.filter((s) => s.id === car.castId)) : 0;
              const mute = car.castId ? muteLevel(frame, fps, muted.find((m) => m.id === car.castId)) : 0;
              const bob = -p.moving * 0.9;
              const skew = p.arriving > 0.02 ? -10 * p.arriving : 0;
              // Exhaust puffs while idling.
              const period = 50 + Math.floor(random(`pp${car.key}`) * 30);
              const pt = (mf + Math.floor(random(`po${car.key}`) * period)) % period;
              const puff = pt < 30 ? pt / 30 : -1;
              return (
                <div key={car.key} style={{ position: 'absolute', left: p.cx - p.w / 2, top: p.top }}>
                  {puff >= 0 && (
                    <div
                      style={{
                        position: 'absolute',
                        left: -14 - puff * 30,
                        top: p.h * 0.72 - puff * 26,
                        width: 18 + puff * 26,
                        height: 18 + puff * 26,
                        borderRadius: '50%',
                        background: g ? '#bbb' : '#d9d2cc',
                        opacity: 0.7 * (1 - puff),
                      }}
                    />
                  )}
                  <CarArt
                    color={car.color}
                    width={p.w}
                    brakeGlow={p.arriving > 0.05 ? 0.2 : p.moving > 0.1 ? 0.25 : 1}
                    speaking={speak}
                    muted={mute}
                    grayscale={g}
                    style={{ transform: `rotate(${bob}deg) skewX(${skew}deg)`, transformOrigin: '50% 100%' }}
                  />
                  {isCast && callers.has(car.castId!) && (
                    <CallBadge w={p.w} frame={frame} fps={fps} leftAt={leftCall.find((l) => l.id === car.castId)?.from} gray={g} />
                  )}
                  {isCast && showTags && !(g && frozen) && (
                    <div
                      style={{
                        position: 'absolute',
                        left: '50%',
                        top: p.h * 0.5,
                        transform: 'translate(-50%, -50%)',
                        padding: `${p.w * 0.012}px ${p.w * 0.045}px`,
                        borderRadius: 999,
                        background: BRAND.cream,
                        color: BRAND.ink,
                        fontFamily: FONT.display,
                        fontWeight: 600,
                        fontSize: p.w * 0.085,
                        whiteSpace: 'nowrap',
                        boxShadow: '0 3px 0 rgba(42,31,31,0.18)',
                        filter: g ? 'grayscale(1)' : undefined,
                      }}
                    >
                      {CAST[car.castId!].name}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </AbsoluteFill>

        {/* Screen-space overlays: bubbles, "left the call" labels, the freeze arrow. */}
        {bubbles.map((b, i) => {
          const car = cars.find((c) => c.castId === b.id);
          if (!car) return null;
          const p = place(car);
          const tip = toScreen(p.cx, p.top + p.h * 0.08);
          const fontSize = 42;
          const width = Math.min(600, Math.max(220, b.text.length * fontSize * 0.5 + 80));
          const left = Math.max(50, Math.min(1030 - width, tip.x - width / 2));
          return (
            <SpeechBubble
              key={i}
              text={b.text}
              from={b.from}
              to={b.to}
              width={width}
              tailX={Math.max(50, Math.min(width - 50, tip.x - left))}
              fontSize={fontSize}
              style={{ left, bottom: 1920 - tip.y }}
            />
          );
        })}
        {leftCall.map((l) => {
          const car = cars.find((c) => c.castId === l.id);
          if (!car) return null;
          const s = popWindow(frame, l.from + 4, l.from + 60, fps);
          if (s <= 0) return null;
          const p = place(car);
          const at = toScreen(p.cx, p.top - 20);
          return (
            <div
              key={l.id}
              style={{
                position: 'absolute',
                left: at.x,
                top: at.y - 40,
                transform: `translate(-50%, -100%) scale(${s}) rotate(-4deg)`,
                padding: '12px 26px',
                borderRadius: 999,
                background: BRAND.ink,
                color: BRAND.cream,
                fontFamily: FONT.display,
                fontWeight: 600,
                fontSize: 40,
                whiteSpace: 'nowrap',
              }}
            >
              left the call 👋
            </div>
          );
        })}
        {frozen && heroP && <MeArrow frame={frame - freezeAt!} fps={fps} target={toScreen(heroP.cx - heroP.w * 0.3, heroP.top + heroP.h * 0.1)} />}
      </AbsoluteFill>
      {freezeAt !== undefined && <Flash at={freezeAt} duration={7} opacity={0.85} />}
      {frozen && (
        <AbsoluteFill
          style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 55%, rgba(42,31,31,0.35) 100%)', pointerEvents: 'none' }}
        />
      )}
    </AbsoluteFill>
  );
}

function speakingLevel(frame: number, ranges: { from: number; to: number }[]): number {
  let level = 0;
  for (const r of ranges) {
    const up = progress(frame, r.from, r.from + 3);
    const down = 1 - progress(frame, r.to - 3, r.to);
    level = Math.max(level, Math.min(up, down));
  }
  return level * (0.82 + 0.18 * Math.sin(frame / 2.2));
}

function muteLevel(frame: number, fps: number, m?: { from: number }): number {
  return m ? popIn(frame, m.from, fps) : 0;
}

/** Green headset badge on the roof; at `leftAt` it flies off. */
function CallBadge({ w, frame, fps, leftAt, gray }: { w: number; frame: number; fps: number; leftAt?: number; gray: number }) {
  const size = Math.max(28, w * 0.2);
  const gone = leftAt === undefined ? 0 : progress(frame, leftAt, leftAt + 16);
  if (gone >= 1) return null;
  const inP = popIn(frame, 0, fps);
  return (
    <div
      style={{
        position: 'absolute',
        left: w * 0.1,
        top: -size * 0.35,
        width: size,
        height: size,
        borderRadius: '50%',
        background: SPEAKING_GREEN,
        border: `${Math.max(3, size * 0.07)}px solid ${BRAND.cream}`,
        display: 'grid',
        placeItems: 'center',
        transform: `translate(${-gone * 60}px, ${-gone * 160 + gone * gone * 40}px) rotate(${-gone * 70}deg) scale(${inP})`,
        opacity: 1 - gone,
        filter: gray ? 'grayscale(1)' : undefined,
        boxShadow: '0 4px 10px rgba(42,31,31,0.25)',
      }}
    >
      <HeadphonesGlyph size={size * 0.6} color={BRAND.cream} />
    </div>
  );
}

/** Hand-drawn orange arrow + "me", drawing itself toward `target` (screen px). */
function MeArrow({ frame, fps, target }: { frame: number; fps: number; target: { x: number; y: number } }) {
  const start = { x: target.x - 250, y: target.y - 330 };
  const draw = progress(frame, 3, 13);
  const d = `M${start.x} ${start.y} C ${start.x + 20} ${start.y + 160}, ${target.x - 150} ${target.y - 60}, ${target.x} ${target.y}`;
  const len = 520;
  const headIn = progress(frame, 12, 15);
  // Arrowhead: two strokes at the tip, angled back along the curve's end direction (from the last control point).
  const ang = Math.atan2(target.y - (target.y - 60), target.x - (target.x - 150));
  const hl = 56;
  const h1 = { x: target.x - hl * Math.cos(ang - 0.5), y: target.y - hl * Math.sin(ang - 0.5) };
  const h2 = { x: target.x - hl * Math.cos(ang + 0.5), y: target.y - hl * Math.sin(ang + 0.5) };
  const label = popIn(frame, 9, fps, 9);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0 }}>
        <path d={d} fill="none" stroke={BRAND.orange} strokeWidth={16} strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - draw)} />
        {headIn > 0 && (
          <path
            d={`M${h1.x} ${h1.y} L${target.x} ${target.y} L${h2.x} ${h2.y}`}
            fill="none"
            stroke={BRAND.orange}
            strokeWidth={16}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={headIn}
          />
        )}
      </svg>
      <div
        style={{
          position: 'absolute',
          left: start.x - 120,
          top: start.y - 150,
          fontFamily: FONT.marker,
          fontSize: 130,
          color: BRAND.orange,
          transform: `rotate(-10deg) scale(${label})`,
          textShadow: `4px 4px 0 ${BRAND.cream}`,
        }}
      >
        me
      </div>
    </AbsoluteFill>
  );
}
