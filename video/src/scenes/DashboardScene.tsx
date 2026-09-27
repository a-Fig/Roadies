// Driver POV: windshield onto the jam, the car ahead on its brakes, both
// hands on the wheel at 10 and 2, and the phone on a dash mount showing
// whatever the reel puts in `children` (a phone capture).
import type { ReactNode } from 'react';
import { AbsoluteFill, Easing, random } from 'remotion';
import { BRAND } from '../cast';
import { useFrame } from '../clock';
import { CarArt } from '../components/CarArt';
import { CarRear, carRearHeight } from '../components/CarRear';
import { FONT } from '../components/fonts';
import { RoadiesWordmark } from '../components/icons';
import { PhoneFrame, phoneFrameHeight, phoneScreenSize } from '../components/PhoneFrame';
import { Hills, Sky } from '../components/Scenery';
import { SpeechBubble } from '../components/SpeechBubble';
import { BoomZoom } from '../fx';

export interface DashboardSceneProps {
  /** The phone screen (fills it; size with `DASH_PHONE_SCREEN`). Default: a placeholder. */
  children?: ReactNode;
  /** What the driver says, in a bubble over the dash, [from, to). */
  sayBubble?: { text: string; from: number; to: number };
  /** Vine-boom punch-in on the phone at this frame. */
  boomAt?: number;
  /** Punch-in zoom. Default 1.4. */
  boomScale?: number;
  /** Frames to hold the boom before easing back; omit to stay zoomed. */
  boomHold?: number;
  /** Stop-and-go period of the car ahead in frames; 0 keeps it on the brakes. Default 90. */
  creepEvery?: number;
}

/** The mounted phone: top-left corner and outer width, in canvas px. */
export const DASH_PHONE = { x: 540, y: 180, width: 380 } as const;
/** Screen size inside the mounted phone, for sizing a capture. */
export const DASH_PHONE_SCREEN = phoneScreenSize(DASH_PHONE.width);
const PHONE_H = phoneFrameHeight(DASH_PHONE.width);
/** Center of the mounted phone, the default zoom target. */
export const DASH_PHONE_CENTER = { x: DASH_PHONE.x + DASH_PHONE.width / 2, y: DASH_PHONE.y + PHONE_H / 2 } as const;

const VP = { x: 330, y: 470 }; // vanishing point, straight ahead of the driver
const DASH_TOP = 850;
const SKIN = '#e0a67a';
const SKIN_LINE = '#b97d55';
const WHEEL = { x: 330, y: 1360, r: 340 };

export function DashboardScene({ children, sayBubble, boomAt, boomScale = 1.4, boomHold, creepEvery = 90 }: DashboardSceneProps) {
  const frame = useFrame();
  const idle = Math.sin(frame / 1.7) * 0.8; // engine idle shiver, px

  // The car ahead creeps off, then we close the gap again.
  const creepLen = 44;
  const t = creepEvery > 0 ? frame % creepEvery : -1;
  const p = t >= 0 && t < creepLen ? t / creepLen : 0;
  const away = Math.sin(Math.PI * Easing.inOut(Easing.quad)(p));
  const brake = t >= 0 && t < creepLen * 0.62 && p > 0 ? 0.1 : 1;
  const aheadW = 330 * (1 - 0.14 * away);
  const aheadBase = 700 - 36 * away;

  const content = (
    <AbsoluteFill style={{ transform: `translateY(${idle}px)` }}>
      {/* Through the windshield. */}
      <Sky />
      <Hills left={-100} width={1300} bottom={VP.y + 10} height={160} color="#cfe5e1" seed="dash-far" bumps={6} />
      <Hills left={-100} width={1300} bottom={VP.y + 16} height={80} color="#ead7a4" seed="dash-near" bumps={8} trees={10} />
      <Road />
      {/* Far traffic: a sea of brake lights at the horizon. */}
      {Array.from({ length: 14 }, (_, i) => {
        const x = -40 + i * 82 + random(`hz${i}`) * 20;
        const w = 58 + random(`hw${i}`) * 14;
        return (
          <div key={i} style={{ position: 'absolute', left: x, top: VP.y + 4 - w * 0.5 }}>
            <CarRear color={['#9fb3c8', '#c9bfb5', '#e0c38c', '#8fb9a8'][i % 4]!} width={w} brake={0.9} plate="" />
          </div>
        );
      })}
      <div style={{ position: 'absolute', left: -90, top: 640 - carRearHeight(230) }}>
        <CarRear color="#b7a1c9" width={230} plate="SLOW" />
      </div>
      <div style={{ position: 'absolute', left: 150, top: 560 - carRearHeight(150) }}>
        <CarRear color="#8fb9a8" width={150} plate="" />
      </div>
      <div style={{ position: 'absolute', left: 630, top: 650 - carRearHeight(250) }}>
        <CarRear color="#d9a58f" width={250} plate="OMG" />
      </div>
      <div style={{ position: 'absolute', left: VP.x - aheadW / 2, top: aheadBase - carRearHeight(aheadW) }}>
        <CarRear color="#9fb3c8" width={aheadW} brake={brake} />
      </div>
      <Cabin frame={frame} />
      {/* The phone on its dash mount. */}
      <Mount />
      <div style={{ position: 'absolute', left: DASH_PHONE.x, top: DASH_PHONE.y }}>
        <PhoneFrame width={DASH_PHONE.width} screenBackground={BRAND.cream}>
          {children ?? <PhonePlaceholder />}
        </PhoneFrame>
      </div>
      <Wheel />
      {sayBubble && (
        <SpeechBubble
          text={sayBubble.text}
          from={sayBubble.from}
          to={sayBubble.to}
          fontSize={64}
          tailX={170}
          style={{ left: 70, bottom: 1920 - 1000 }}
        />
      )}
    </AbsoluteFill>
  );

  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: BRAND.ink }}>
      {boomAt === undefined ? (
        content
      ) : (
        <BoomZoom at={boomAt} scale={boomScale} hold={boomHold} originX={DASH_PHONE_CENTER.x} originY={DASH_PHONE_CENTER.y}>
          {content}
        </BoomZoom>
      )}
    </AbsoluteFill>
  );
}

/** Asphalt converging on the vanishing point, with dashed lane lines. */
function Road() {
  const lanes = [-900, -300, 300, 900]; // lane-line x at the dash
  return (
    <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0 }}>
      <rect x={0} y={VP.y} width={1080} height={DASH_TOP + 200 - VP.y} fill="#cdbb86" />
      <path d={`M${VP.x - 70} ${VP.y} L${VP.x + 70} ${VP.y} L2200 ${DASH_TOP + 200} L-1500 ${DASH_TOP + 200} Z`} fill="#5d5350" />
      {lanes.map((x) => (
        <line
          key={x}
          x1={VP.x + x * 0.04}
          y1={VP.y + 4}
          x2={VP.x + x}
          y2={DASH_TOP + 200}
          stroke={BRAND.cream}
          strokeOpacity={0.75}
          strokeWidth={10}
          strokeDasharray="60 70"
        />
      ))}
    </svg>
  );
}

/** A-pillars, headliner, rear-view mirror with a swinging air freshener, and the dash. */
function Cabin({ frame }: { frame: number }) {
  const swing = Math.sin(frame / 11) * 9;
  return (
    <>
      <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0 }}>
        <path d="M0 0 L150 0 Q60 400 30 900 L0 900 Z" fill="#3a302e" />
        <path d="M1080 0 L960 0 Q1040 400 1062 900 L1080 900 Z" fill="#3a302e" />
        <path d="M0 0 L1080 0 L1080 56 Q540 92 0 56 Z" fill="#4a3f3c" />
        {/* Dash. */}
        <path d={`M0 ${DASH_TOP + 30} Q300 ${DASH_TOP - 40} 540 ${DASH_TOP - 10} Q800 ${DASH_TOP + 20} 1080 ${DASH_TOP - 20} L1080 1920 L0 1920 Z`} fill="#3b3130" />
        <path d={`M0 ${DASH_TOP + 30} Q300 ${DASH_TOP - 40} 540 ${DASH_TOP - 10} Q800 ${DASH_TOP + 20} 1080 ${DASH_TOP - 20}`} fill="none" stroke="#56494560" strokeWidth={10} />
        {/* Instrument hood with the saddest speedometer. */}
        <path d="M150 1030 Q150 900 330 900 Q510 900 510 1030 Z" fill="#2a2222" />
        <text x="330" y="990" textAnchor="middle" fontFamily={FONT.sign} fontWeight={800} fontSize="64" fill={BRAND.orange}>
          0
        </text>
        <text x="410" y="990" fontFamily={FONT.sign} fontWeight={700} fontSize="22" fill="#b3a8a0">
          MPH
        </text>
      </svg>
      {/* Mirror. */}
      <div style={{ position: 'absolute', left: 316, top: 40, width: 18, height: 36, background: '#2a2222' }} />
      <div
        style={{
          position: 'absolute',
          left: 190,
          top: 66,
          width: 270,
          height: 86,
          borderRadius: 26,
          background: 'linear-gradient(170deg, #c8d6e4, #8ea2b8)',
          border: '10px solid #2a2222',
          boxSizing: 'border-box',
        }}
      />
      {/* Air freshener: a tiny teal car on a string. */}
      <div style={{ position: 'absolute', left: 250, top: 146, transformOrigin: '0 0', transform: `rotate(${swing}deg)` }}>
        <div style={{ position: 'absolute', left: -1, top: 0, width: 3, height: 70, background: '#e7e2d6' }} />
        <CarArt color={BRAND.teal} width={110} style={{ position: 'absolute', left: -55, top: 62 }} />
      </div>
    </>
  );
}

/** Clamp jaws beside the phone and the arm down to the dash. */
function Mount() {
  const { x, y, width } = DASH_PHONE;
  const midY = y + PHONE_H * 0.55;
  return (
    <>
      <div style={{ position: 'absolute', left: x + width / 2 - 26, top: midY, width: 52, height: DASH_TOP - midY + 40, background: '#2a2222', borderRadius: 12 }} />
      <div style={{ position: 'absolute', left: x + width / 2 - 70, top: DASH_TOP + 10, width: 140, height: 44, background: '#2a2222', borderRadius: '50% 50% 12px 12px' }} />
      {[-1, 1].map((side) => (
        <div
          key={side}
          style={{
            position: 'absolute',
            left: side < 0 ? x - 22 : x + width - 8,
            top: midY - 70,
            width: 30,
            height: 140,
            borderRadius: 10,
            background: '#3a3232',
            boxShadow: 'inset 0 0 0 3px #4a4040',
          }}
        />
      ))}
    </>
  );
}

/** The steering wheel with both hands on it at 10 and 2, sleeves down to the camera. */
function Wheel() {
  const { x, y, r } = WHEEL;
  const hand = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    return { x: x + r * Math.sin(a), y: y - r * Math.cos(a), rot: deg };
  };
  const left = hand(-48);
  const right = hand(48);
  const arm = (h: { x: number; y: number }, bottomX: number) =>
    `M${h.x - 58} ${h.y + 20} L${h.x + 58} ${h.y + 20} L${bottomX + 120} 1960 L${bottomX - 120} 1960 Z`;
  return (
    <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0 }}>
      {/* Spokes and hub. */}
      <path d={`M${x - r} ${y} L${x - 90} ${y - 20} L${x + 90} ${y - 20} L${x + r} ${y} L${x + 90} ${y + 60} L${x - 90} ${y + 60} Z`} fill="#2f2626" />
      <rect x={x - 45} y={y} width={90} height={r} fill="#2f2626" />
      <circle cx={x} cy={y + 10} r={100} fill="#352b2a" stroke="#241c1c" strokeWidth={8} />
      <circle cx={x} cy={y + 10} r={42} fill={BRAND.orange} />
      {/* Rim. */}
      <circle cx={x} cy={y} r={r} fill="none" stroke="#241c1c" strokeWidth={66} />
      <circle cx={x} cy={y} r={r + 18} fill="none" stroke="#4a3f3c" strokeWidth={8} strokeDasharray="30 40" />
      {/* Sleeves (teal hoodie, cream cuffs) then hands wrapped over the rim. */}
      <path d={arm(left, -60)} fill={BRAND.teal} />
      <path d={arm(right, 720)} fill={BRAND.teal} />
      {[left, right].map((h, i) => (
        <g key={i} transform={`translate(${h.x} ${h.y}) rotate(${h.rot})`}>
          <rect x={-62} y={16} width={124} height={34} rx={14} fill={BRAND.cream} />
          <ellipse cx={0} cy={-4} rx={66} ry={52} fill={SKIN} stroke={SKIN_LINE} strokeWidth={5} />
          {[-30, -2, 26].map((fx) => (
            <path key={fx} d={`M${fx} -44 Q${fx + 8} -10 ${fx + 4} 26`} fill="none" stroke={SKIN_LINE} strokeWidth={5} strokeLinecap="round" />
          ))}
          <ellipse cx={i === 0 ? 50 : -50} cy={-30} rx={22} ry={16} fill={SKIN} stroke={SKIN_LINE} strokeWidth={5} />
        </g>
      ))}
    </svg>
  );
}

/** Stand-in screen for previews: the wordmark and four avatars. */
function PhonePlaceholder() {
  const frame = useFrame();
  const colors = [BRAND.teal, '#b0b5bd', BRAND.brakeRed, '#ff7ac8'];
  return (
    <AbsoluteFill style={{ background: BRAND.cream, alignItems: 'center', paddingTop: 90, gap: 40 }}>
      <RoadiesWordmark width={220} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 }}>
        {colors.map((c, i) => (
          <div
            key={c}
            style={{
              width: 120,
              height: 120,
              borderRadius: '50%',
              background: c,
              boxShadow: i === 0 ? `0 0 0 ${6 + 3 * Math.sin(frame / 3)}px ${BRAND.goGreen}` : undefined,
            }}
          />
        ))}
      </div>
      <div style={{ fontFamily: FONT.display, fontWeight: 600, fontSize: 26, color: BRAND.ink, opacity: 0.6 }}>phone capture goes here</div>
    </AbsoluteFill>
  );
}

