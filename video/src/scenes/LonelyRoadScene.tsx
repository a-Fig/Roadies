// Gilroy (or wherever the loner landed): an empty dusky road, one Gold Mustang
// under its own rain cloud, a tumbleweed, and the "alone — merging in" countdown. At `zoomOffAt` the
// Mustang gets merged and blasts off to a room far away.
import { AbsoluteFill, random, useCurrentFrame, useVideoConfig } from 'remotion';
import { BRAND, CAST } from '../cast';
import { CarArt, carHeight } from '../components/CarArt';
import { FONT } from '../components/fonts';
import { ASPHALT, FreewaySign, Hills, Sky } from '../components/Scenery';
import { SpeechBubble } from '../components/SpeechBubble';
import { Countdown, SpeedLines } from '../fx';
import { popIn, progress } from '../fx/anim';

export interface LonelyRoadSceneProps {
  /** The town on the freeway sign. Default 'Gilroy', which also gets its garlic sign. */
  place?: string;
  /** Countdown runs [countdownFrom, countdownTo], counting `countdownStart` down to 0. Defaults 15, 105, 15. */
  countdownFrom?: number;
  countdownTo?: number;
  countdownStart?: number;
  /** Default '⏱ alone — merging in' (the projector says "Alone — merging in Ns"). */
  countdownLabel?: string;
  /** The merge: the Mustang blasts off right. Default 112; pass null to never leave. */
  zoomOffAt?: number | null;
  /** Frame the tumbleweed starts rolling across. Default 0. */
  tumbleweedAt?: number;
  /** Optional bubble over the Mustang, [from, to). */
  sayBubble?: { text: string; from: number; to: number };
  /** Pops at `zoomOffAt` for 1.5 s. Default 'merged!'; null hides it. */
  mergedLabel?: string | null;
}

const CAR_W = 360;
const CAR_X = 540;
const BASE = 1000; // wheels' bottom (far lane)
const ROAD_TOP = 880;
const ROAD_BOTTOM = 1130;
const CLOUD_Y = 590;
const LANE_LINE = 1030;

export function LonelyRoadScene({
  place = 'Gilroy',
  countdownFrom = 15,
  countdownTo = 105,
  countdownStart = 15,
  countdownLabel = '⏱ alone — merging in',
  zoomOffAt = 112,
  tumbleweedAt = 0,
  sayBubble,
  mergedLabel = 'merged!',
}: LonelyRoadSceneProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const z = zoomOffAt ?? 1e9; // never; finite, since interpolate() rejects Infinity
  const tz = frame - z;

  // Anticipation squash, then an accelerating blast to the right.
  const windup = progress(frame, z - 8, z);
  const blast = tz > 0 ? tz * tz * 4 + tz * 10 : 0;
  const carX = CAR_X - windup * 26 * (tz > 0 ? 0 : 1) + blast;
  const skew = tz > 0 ? -Math.min(16, tz * 3) : windup * 10;
  const h = carHeight(CAR_W);

  // Sad blue tint lifts once he's merged.
  const tint = 1 - progress(frame, z + 4, z + 24);
  const cloudPoof = progress(frame, z + 12, z + 22);

  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: BRAND.ink }}>
      <Sky mood="gloom" />
      <Hills left={-60} width={1200} bottom={ROAD_TOP} height={300} color="#6f7d96" seed="gil-far" bumps={5} />
      <Hills left={-60} width={1200} bottom={ROAD_TOP + 6} height={120} color="#8a8574" seed="gil-near" bumps={7} trees={8} treeColor="#4f5a54" />

      <FreewaySign x={60} y={420} width={300} postBottom={ROAD_TOP + 4}>
        <div style={{ textAlign: 'center', lineHeight: 1.05 }}>
          <div style={{ fontWeight: 800, fontSize: Math.min(64, Math.round(440 / place.length)), letterSpacing: 3 }}>{place.toUpperCase()}</div>
          <div style={{ fontWeight: 700, fontSize: 26, letterSpacing: 1 }}>NEXT 3 EXITS</div>
        </div>
      </FreewaySign>
      {place === 'Gilroy' && <WelcomeSign />}

      {/* Road. */}
      <div style={{ position: 'absolute', left: 0, top: ROAD_TOP, width: 1080, height: ROAD_BOTTOM - ROAD_TOP, background: ASPHALT }} />
      <div style={{ position: 'absolute', left: 0, top: ROAD_TOP + 8, width: 1080, height: 6, background: BRAND.cream, opacity: 0.6 }} />
      <div style={{ position: 'absolute', left: 0, top: ROAD_BOTTOM - 14, width: 1080, height: 6, background: BRAND.cream, opacity: 0.6 }} />
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: LANE_LINE,
          width: 1080,
          height: 8,
          backgroundImage: `repeating-linear-gradient(90deg, #e8c85a 0 70px, transparent 70px 150px)`,
          opacity: 0.7,
        }}
      />
      <div style={{ position: 'absolute', left: 0, top: ROAD_BOTTOM, width: 1080, height: 1920 - ROAD_BOTTOM, background: 'linear-gradient(180deg, #7d8a6e, #5f6b55)' }} />
      {/* Garlic fields, obviously. */}
      {[0, 1, 2].map((row) =>
        Array.from({ length: 9 + row }, (_, i) => {
          const size = 44 + row * 14;
          const x = -20 + (i + (row % 2) * 0.5) * (1080 / (8 + row)) + random(`gf${row}${i}`) * 16;
          return (
            <div key={`${row}-${i}`} style={{ position: 'absolute', left: x, top: ROAD_BOTTOM + 30 + row * 70 }}>
              <Garlic size={size} face={false} />
            </div>
          );
        }),
      )}

      {/* Dust kicked up by the launch. */}
      {tz >= 0 &&
        Array.from({ length: 9 }, (_, i) => {
          const born = i * 2;
          const age = tz - born;
          if (age < 0 || age > 26) return null;
          const k = age / 26;
          const r = 30 + k * 90 + random(`dust-r${i}`) * 30;
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: CAR_X - CAR_W * 0.45 + born * 22 - r - k * 60,
                top: BASE - r * 0.9 - random(`dust-y${i}`) * 30,
                width: r * 2,
                height: r * 1.4,
                borderRadius: '50%',
                background: '#cbbfa8',
                opacity: 0.85 * (1 - k),
              }}
            />
          );
        })}

      <div style={{ position: 'absolute', left: carX - CAR_W / 2, top: BASE - h }}>
        <CarArt
          color={CAST.mustang.hex}
          width={CAR_W}
          brakeGlow={tz > 0 ? 0 : 1}
          style={{ transform: `skewX(${skew}deg)`, transformOrigin: '50% 100%' }}
        />
      </div>

      <Tumbleweed frame={frame - tumbleweedAt} />
      <RainCloud frame={frame} poof={cloudPoof} />

      {/* Sad blue wash over the scenery (the countdown stays bright). */}
      <AbsoluteFill style={{ background: '#28468c', mixBlendMode: 'multiply', opacity: 0.28 * tint, pointerEvents: 'none' }} />

      {zoomOffAt !== null && <SpeedLines from={z} to={z + 34} direction="right" top={760} bottom={1110} count={18} seed="gilroy" />}
      {sayBubble && (
        <SpeechBubble
          text={sayBubble.text}
          from={sayBubble.from}
          to={sayBubble.to}
          tailX={170}
          fontSize={48}
          style={{ left: 150, bottom: 1920 - (BASE - h + 10) }}
        />
      )}
      {/* The count gives way to "merged!" the moment he goes. */}
      <AbsoluteFill style={{ opacity: 1 - progress(frame, z, z + 3) }}>
        <Countdown from={countdownFrom} to={countdownTo} start={countdownStart} y={400} size={300} label={countdownLabel} />
      </AbsoluteFill>
      {mergedLabel && tz >= 0 && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 300,
            textAlign: 'center',
            fontFamily: FONT.display,
            fontWeight: 700,
            fontSize: 110,
            color: BRAND.goGreen,
            textShadow: `0 6px 0 ${BRAND.ink}`,
            transform: `scale(${popIn(frame, z, fps, 8)}) rotate(-4deg)`,
            opacity: 1 - progress(frame, z + 40, z + 48),
          }}
        >
          {mergedLabel}
        </div>
      )}
    </AbsoluteFill>
  );
}

/** "Garlic Capital of the World" roadside sign with a sad garlic bulb. */
function WelcomeSign() {
  const left = 680;
  const top = 600;
  const w = 240;
  return (
    <div style={{ position: 'absolute', left, top, width: w }}>
      {[0.22, 0.78].map((f) => (
        <div key={f} style={{ position: 'absolute', left: w * f - 9, top: 60, width: 18, height: ROAD_TOP + 4 - top - 60, background: '#6b4a32' }} />
      ))}
      <div
        style={{
          position: 'relative',
          background: '#f6ecd2',
          border: '8px solid #6b4a32',
          borderRadius: 22,
          padding: '10px 12px 12px',
          textAlign: 'center',
          fontFamily: FONT.display,
          color: '#5a3b26',
          lineHeight: 1.05,
          boxShadow: '0 8px 0 rgba(42,31,31,0.2)',
        }}
      >
        <Garlic size={78} />
        <div style={{ fontWeight: 700, fontSize: 28 }}>Garlic Capital</div>
        <div style={{ fontWeight: 600, fontSize: 24 }}>of the World</div>
      </div>
    </div>
  );
}

function Garlic({ size, face = true }: { size: number; face?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <path d="M50 6 C54 20 70 26 80 40 C94 60 88 88 64 94 L36 94 C12 88 6 60 20 40 C30 26 46 20 50 6 Z" fill="#fffaf0" stroke="#b8a58c" strokeWidth="4" />
      <path d="M50 22 C44 44 44 74 50 92 M50 22 C58 44 60 74 54 92 M30 44 C26 60 30 82 40 92 M70 44 C74 60 70 82 60 92" fill="none" stroke="#c9b3d6" strokeWidth="3" />
      {face && (
        <>
          <circle cx="40" cy="64" r="3.5" fill={BRAND.ink} />
          <circle cx="60" cy="64" r="3.5" fill={BRAND.ink} />
          <path d="M42 78 Q50 72 58 78" fill="none" stroke={BRAND.ink} strokeWidth="3" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

/** A tiny personal rain cloud over the Mustang; it stays behind when he leaves, then poofs. */
function RainCloud({ frame, poof }: { frame: number; poof: number }) {
  if (poof >= 1) return null;
  const bob = Math.sin(frame / 9) * 6;
  const s = 1 - poof;
  return (
    <div style={{ position: 'absolute', left: CAR_X - 120, top: CLOUD_Y + bob, width: 240, height: 200, transform: `scale(${s})`, opacity: s }}>
      {Array.from({ length: 12 }, (_, i) => {
        const x = 30 + random(`rain-x${i}`) * 180;
        const y = 60 + ((frame * 16 + random(`rain-y${i}`) * 140) % 140);
        return <div key={i} style={{ position: 'absolute', left: x, top: y, width: 5, height: 26, borderRadius: 3, background: '#b9d0f5', transform: 'rotate(12deg)' }} />;
      })}
      {[
        [20, 30, 70],
        [70, 0, 90],
        [140, 22, 70],
      ].map(([x, y, d], i) => (
        <div key={i} style={{ position: 'absolute', left: x, top: y, width: d, height: d, borderRadius: '50%', background: '#3f4859', boxShadow: 'inset 0 6px 0 #5a6479' }} />
      ))}
      <div style={{ position: 'absolute', left: 14, top: 50, width: 206, height: 46, borderRadius: 23, background: '#3f4859' }} />
    </div>
  );
}

/** A tumbleweed rolling right to left along the near shoulder, bouncing. */
function Tumbleweed({ frame }: { frame: number }) {
  if (frame < 0) return null;
  const size = 110;
  const x = 1180 - frame * 11;
  if (x < -size * 2) return null;
  const hop = Math.abs(Math.sin(frame / 7)) * 50;
  const strands = Array.from({ length: 11 }, (_, i) => {
    const a = random(`tw-a${i}`) * Math.PI;
    const r = 26 + random(`tw-r${i}`) * 26;
    return `M${50 + Math.cos(a) * r} ${50 + Math.sin(a) * r} Q${50 + (random(`tw-q${i}`) - 0.5) * 60} ${50 + (random(`tw-p${i}`) - 0.5) * 60} ${50 - Math.cos(a) * r} ${50 - Math.sin(a) * r}`;
  });
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      style={{ position: 'absolute', left: x, top: ROAD_BOTTOM - size - 8 - hop, transform: `rotate(${-frame * 14}deg)` }}
    >
      <circle cx="50" cy="50" r="44" fill="none" stroke="#9c7a4f" strokeWidth="5" />
      {strands.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={i % 2 ? '#b08d5d' : '#8a6a40'} strokeWidth="4" strokeLinecap="round" />
      ))}
    </svg>
  );
}
