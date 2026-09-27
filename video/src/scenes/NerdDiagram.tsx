// "part 2 for the nerds": how a spoken command works, then the mute trick.
// Four phones in a LiveKit room, the hidden listener bot hearing every mic,
// bot -> Google STT -> "unmute" -> server -> back to the phone; then a muted
// phone's lines to the others get cut while its line to the bot stays.
import type { ReactNode } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { BRAND, CAST, type CastId } from '../cast';
import { CarArt } from '../components/CarArt';
import { FONT } from '../components/fonts';
import { MicGlyph } from '../components/icons';
import { SpeechBubble } from '../components/SpeechBubble';
import { popIn, progress } from '../fx/anim';

/** Frame (relative to the scene) each step of the diagram starts. */
export interface NerdSteps {
  title: number;
  room: number;
  phones: number;
  peerLines: number;
  bot: number;
  earLines: number;
  /** The hero (muted) says the command. */
  speak: number;
  stt: number;
  /** The transcript chip travels STT -> server. */
  chip: number;
  server: number;
  /** Green arrow back to the hero; the hero unmutes and its lines connect. */
  check: number;
  /** The Prius mutes: its lines to the others get red X's, its bot line stays. */
  muteTrick: number;
  label: number;
}

export const NERD_STEPS: NerdSteps = {
  title: 0,
  room: 12,
  phones: 24,
  peerLines: 45,
  bot: 70,
  earLines: 85,
  speak: 115,
  stt: 135,
  chip: 158,
  server: 180,
  check: 200,
  muteTrick: 250,
  label: 272,
};

export interface NerdDiagramProps {
  /** Override any step's start frame. */
  steps?: Partial<NerdSteps>;
  /** The spoken command. Default 'unmute'. */
  command?: string;
  /** Default 'part 2 for the nerds 🤓'. */
  title?: string;
  /** Default 'muted = only the bot\ncan hear you 🤫' (newlines break lines). */
  label?: string;
}

type Pt = { x: number; y: number };
const NODES: Record<'prius' | 'tacoma' | 'miata' | 'hero', Pt> = {
  prius: { x: 220, y: 410 },
  tacoma: { x: 780, y: 410 },
  miata: { x: 220, y: 690 },
  hero: { x: 780, y: 690 },
};
type NodeId = keyof typeof NODES;
const IDS = Object.keys(NODES) as NodeId[];
const BOT: Pt = { x: 500, y: 800 };
const PHONE = { w: 100, h: 170 };
const STT_BOX = { x: 80, y: 990, w: 360, h: 130 };
const SERVER_BOX = { x: 560, y: 990, w: 360, h: 130 };
const RED = BRAND.brakeRed;
const GREEN = BRAND.goGreen;
const TEAL_LIGHT = '#4fb3c2';

export function NerdDiagram({
  steps: stepOverrides,
  command = 'unmute',
  title = 'part 2 for the nerds 🤓',
  label = 'muted = only the bot\ncan hear you 🤫',
}: NerdDiagramProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const S = { ...NERD_STEPS, ...stepOverrides };
  const pop = (at: number, damping?: number) => popIn(frame, at, fps, damping);
  const draw = (at: number, len = 14) => progress(frame, at, at + len);

  const heroUnmuted = frame >= S.check + 10;
  const priusMuted = frame >= S.muteTrick;
  const pipelineDim = 1 - progress(frame, S.muteTrick, S.muteTrick + 10);

  const pairs: [NodeId, NodeId][] = [];
  IDS.forEach((a, i) => IDS.slice(i + 1).forEach((b) => pairs.push([a, b])));

  return (
    <AbsoluteFill
      style={{
        background: BRAND.ink,
        backgroundImage:
          'linear-gradient(rgba(255,252,238,0.045) 2px, transparent 2px), linear-gradient(90deg, rgba(255,252,238,0.045) 2px, transparent 2px)',
        backgroundSize: '60px 60px',
        color: BRAND.cream,
        fontFamily: FONT.display,
        overflow: 'hidden',
      }}
    >
      <div style={{ position: 'absolute', left: 60, right: 140, top: 150, textAlign: 'center', fontWeight: 700, fontSize: 72, transform: `scale(${pop(S.title)})` }}>{title}</div>

      {/* The LiveKit room. */}
      <div
        style={{
          position: 'absolute',
          left: 80,
          top: 280,
          width: 840,
          height: 650,
          border: `5px dashed rgba(255,252,238,0.45)`,
          borderRadius: 40,
          transform: `scale(${pop(S.room)})`,
        }}
      >
        <div style={{ position: 'absolute', left: 30, top: -26, padding: '4px 22px', borderRadius: 999, background: BRAND.teal, fontWeight: 600, fontSize: 32 }}>LiveKit room</div>
      </div>

      <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0 }}>
        {/* Peer audio between phones. The hero's lines connect once it unmutes; the Prius's get cut when it mutes. */}
        {pairs.map(([a, b]) => {
          const pa = NODES[a];
          const pb = NODES[b];
          const involvesHero = a === 'hero' || b === 'hero';
          const involvesPrius = a === 'prius' || b === 'prius';
          const p = involvesHero ? draw(S.check + 10, 12) : draw(S.peerLines);
          if (p <= 0) return null;
          const cut = involvesPrius && priusMuted;
          return (
            <line
              key={`${a}${b}`}
              x1={pa.x}
              y1={pa.y}
              x2={pa.x + (pb.x - pa.x) * p}
              y2={pa.y + (pb.y - pa.y) * p}
              stroke={cut ? RED : BRAND.cream}
              strokeOpacity={cut ? 0.9 : 0.55}
              strokeWidth={6}
              strokeDasharray={cut ? '14 14' : undefined}
            />
          );
        })}
        {/* Ear lines: every mic goes to the bot, muted or not. */}
        {IDS.map((id) => {
          const n = NODES[id];
          const p = draw(S.earLines + IDS.indexOf(id) * 3, 12);
          if (p <= 0) return null;
          const hot = (id === 'hero' && frame >= S.speak && frame < S.stt + 10) || (id === 'prius' && priusMuted);
          const c = { x: (n.x + BOT.x) / 2 + (n.x < BOT.x ? -60 : 60), y: (n.y + BOT.y) / 2 + 40 };
          return (
            <path
              key={id}
              d={`M${n.x} ${n.y + PHONE.h / 2 - 10} Q${c.x} ${c.y} ${BOT.x} ${BOT.y}`}
              fill="none"
              stroke={hot ? TEAL_LIGHT : BRAND.teal}
              strokeWidth={hot ? 12 : 6}
              strokeDasharray="4 18"
              strokeLinecap="round"
              strokeDashoffset={-frame * 3}
              opacity={p}
            />
          );
        })}
        {/* Bot -> STT, STT -> server (the chip rides it), server -> hero. */}
        <Arrow from={{ x: BOT.x - 70, y: BOT.y + 10 }} ctrl={{ x: 200, y: BOT.y + 20 }} to={{ x: 260, y: STT_BOX.y - 8 }} p={draw(S.stt, 12)} color={TEAL_LIGHT} opacity={pipelineDim} />
        <Arrow
          from={{ x: STT_BOX.x + STT_BOX.w + 6, y: STT_BOX.y + STT_BOX.h / 2 }}
          ctrl={{ x: 500, y: STT_BOX.y + STT_BOX.h / 2 }}
          to={{ x: SERVER_BOX.x - 8, y: SERVER_BOX.y + SERVER_BOX.h / 2 }}
          p={draw(S.chip, 10)}
          color={BRAND.cream}
          opacity={pipelineDim}
        />
        <Arrow
          from={{ x: SERVER_BOX.x + 300, y: SERVER_BOX.y - 8 }}
          ctrl={{ x: 900, y: 830 }}
          to={{ x: NODES.hero.x + PHONE.w / 2 + 12, y: NODES.hero.y + 30 }}
          p={draw(S.check, 12)}
          color={GREEN}
          width={10}
          opacity={pipelineDim}
        />
        {/* Red X's on the muted Prius's lines. */}
        {IDS.filter((id) => id !== 'prius').map((id, i) => {
          const s = popIn(frame, S.muteTrick + 4 + i * 4, fps, 9);
          if (s <= 0) return null;
          const a = NODES.prius;
          const b = NODES[id];
          // Keep each X clear of the name labels and the bot's ear lines.
          const t = id === 'hero' ? 0.36 : id === 'miata' ? 0.57 : 0.5;
          const m = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
          return (
            <g key={id} transform={`translate(${m.x} ${m.y}) scale(${s})`}>
              <circle r={30} fill={BRAND.ink} stroke={RED} strokeWidth={6} />
              <path d="M-13 -13 L13 13 M13 -13 L-13 13" stroke={RED} strokeWidth={8} strokeLinecap="round" />
            </g>
          );
        })}
      </svg>

      {/* The hidden listener. */}
      <Node at={BOT} scale={pop(S.bot)}>
        <div
          style={{
            width: 124,
            height: 124,
            borderRadius: '50%',
            background: '#163f46',
            border: `5px dashed ${TEAL_LIGHT}`,
            display: 'grid',
            placeItems: 'center',
            fontSize: 70,
            boxShadow: priusMuted || (frame >= S.speak && frame < S.stt + 10) ? `0 0 40px ${TEAL_LIGHT}` : undefined,
          }}
        >
          🤖
        </div>
        <div style={{ position: 'absolute', left: '50%', top: 130, transform: 'translateX(-50%)', whiteSpace: 'nowrap', fontFamily: FONT.vhs, fontSize: 34, color: TEAL_LIGHT, background: BRAND.ink, padding: '0 10px' }}>
          roadies-listener (hidden)
        </div>
      </Node>

      {IDS.map((id, i) => (
        <PhoneNode
          key={id}
          id={id}
          at={NODES[id]}
          scale={pop(S.phones + i * 4)}
          muted={id === 'hero' ? (frame < S.check + 10 ? 1 : 0) : id === 'prius' ? popIn(frame, S.muteTrick, fps) : 0}
          check={id === 'hero' ? popIn(frame, S.check + 10, fps, 9) : 0}
          unmutedFlash={id === 'hero' && heroUnmuted ? 1 - progress(frame, S.check + 10, S.check + 40) : 0}
        />
      ))}

      <SpeechBubble text={command} from={S.speak} to={S.stt + 12} tail="down-right" fontSize={40} style={{ right: 1080 - (NODES.hero.x - PHONE.w / 2 + 16), bottom: 1920 - (NODES.hero.y + 16) }} />

      {/* Pipeline boxes. */}
      <Box box={STT_BOX} scale={pop(S.stt)} dim={pipelineDim} title="Google STT" sub="speech → text" />
      <Box box={SERVER_BOX} scale={pop(S.server)} dim={pipelineDim} title="Roadies server" sub="applyCommand()" flash={frame >= S.server ? 1 - progress(frame, S.server, S.server + 20) : 0} />
      <Chip text={command} frame={frame} at={S.chip} fps={fps} dim={pipelineDim} />

      {/* The mute trick's punchline, over the faded pipeline. */}
      <div style={{ position: 'absolute', left: 60, right: 140, top: STT_BOX.y - 20, display: 'flex', justifyContent: 'center' }}>
        <div
          style={{
            background: BRAND.cream,
            color: BRAND.ink,
            padding: '14px 36px 20px',
            borderRadius: 34,
            fontWeight: 700,
            fontSize: 58,
            lineHeight: 1.1,
            textAlign: 'center',
            whiteSpace: 'pre-line',
            transform: `scale(${pop(S.label)}) rotate(-2deg)`,
            boxShadow: `0 8px 0 ${BRAND.teal}`,
          }}
        >
          {label}
        </div>
      </div>
    </AbsoluteFill>
  );
}

function Node({ at, scale, children }: { at: Pt; scale: number; children: ReactNode }) {
  if (scale <= 0) return null;
  return (
    <div style={{ position: 'absolute', left: at.x, top: at.y, transform: `translate(-50%, -50%) scale(${scale})` }}>
      <div style={{ position: 'relative' }}>{children}</div>
    </div>
  );
}

function PhoneNode({ id, at, scale, muted, check, unmutedFlash }: { id: CastId; at: Pt; scale: number; muted: number; check: number; unmutedFlash: number }) {
  return (
    <Node at={at} scale={scale}>
      <div
        style={{
          width: PHONE.w,
          height: PHONE.h,
          borderRadius: 22,
          background: '#141214',
          boxShadow: `inset 0 0 0 3px #4a4a52${unmutedFlash > 0 ? `, 0 0 ${50 * unmutedFlash}px ${GREEN}` : ''}`,
          padding: 7,
          boxSizing: 'border-box',
        }}
      >
        <div style={{ width: '100%', height: '100%', borderRadius: 16, background: BRAND.cream, display: 'grid', placeItems: 'center' }}>
          <CarArt color={CAST[id].hex} width={78} brakeGlow={0} />
        </div>
      </div>
      {muted > 0 && (
        <Badge color={RED} scale={muted}>
          <MicGlyph size={30} color={BRAND.cream} slashed />
        </Badge>
      )}
      {check > 0 && (
        <Badge color={GREEN} scale={check}>
          <span style={{ fontSize: 34, fontWeight: 700, color: BRAND.cream }}>✓</span>
        </Badge>
      )}
      <div style={{ position: 'absolute', left: '50%', top: PHONE.h + 4, transform: 'translateX(-50%)', whiteSpace: 'nowrap', fontWeight: 600, fontSize: 26, background: BRAND.ink, padding: '0 10px', borderRadius: 10 }}>
        {CAST[id].name}
      </div>
    </Node>
  );
}

function Badge({ color, scale, children }: { color: string; scale: number; children: ReactNode }) {
  return (
    <div
      style={{
        position: 'absolute',
        right: -22,
        top: -18,
        width: 54,
        height: 54,
        borderRadius: '50%',
        background: color,
        border: `4px solid ${BRAND.ink}`,
        display: 'grid',
        placeItems: 'center',
        transform: `scale(${scale})`,
      }}
    >
      {children}
    </div>
  );
}

function Box({ box, scale, dim, title, sub, flash = 0 }: { box: typeof STT_BOX; scale: number; dim: number; title: string; sub: string; flash?: number }) {
  if (scale <= 0) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        borderRadius: 28,
        background: '#3a2e2c',
        border: `4px solid ${flash > 0 ? GREEN : 'rgba(255,252,238,0.5)'}`,
        boxShadow: flash > 0 ? `0 0 ${40 * flash}px ${GREEN}` : undefined,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        transform: `scale(${scale})`,
        opacity: dim,
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 44 }}>{title}</div>
      <div style={{ fontFamily: FONT.vhs, fontSize: 36, color: TEAL_LIGHT }}>{sub}</div>
    </div>
  );
}

/** The transcript riding from STT to the server. */
function Chip({ text, frame, at, fps, dim }: { text: string; frame: number; at: number; fps: number; dim: number }) {
  const s = popIn(frame, at, fps);
  if (s <= 0) return null;
  const t = progress(frame, at + 4, at + 22);
  const x = STT_BOX.x + STT_BOX.w - 40 + t * (SERVER_BOX.x - STT_BOX.x - STT_BOX.w + 80);
  const arrived = 1 - progress(frame, at + 22, at + 30);
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: STT_BOX.y + STT_BOX.h / 2,
        transform: `translate(-50%, -50%) scale(${s * (0.4 + 0.6 * arrived)})`,
        opacity: dim * (arrived > 0 ? 1 : 0),
        padding: '6px 22px 10px',
        borderRadius: 999,
        background: BRAND.bubble,
        color: '#000',
        fontWeight: 600,
        fontSize: 40,
        whiteSpace: 'nowrap',
      }}
    >
      “{text}”
    </div>
  );
}

/** A quadratic arrow that draws itself (p 0..1), with its head appearing at the end. */
function Arrow({ from, ctrl, to, p, color, width = 7, opacity = 1 }: { from: Pt; ctrl: Pt; to: Pt; p: number; color: string; width?: number; opacity?: number }) {
  if (p <= 0) return null;
  const len = 1000;
  const ang = Math.atan2(to.y - ctrl.y, to.x - ctrl.x);
  const hl = 26;
  const h1 = { x: to.x - hl * Math.cos(ang - 0.55), y: to.y - hl * Math.sin(ang - 0.55) };
  const h2 = { x: to.x - hl * Math.cos(ang + 0.55), y: to.y - hl * Math.sin(ang + 0.55) };
  return (
    <g opacity={opacity}>
      <path
        d={`M${from.x} ${from.y} Q${ctrl.x} ${ctrl.y} ${to.x} ${to.y}`}
        pathLength={len}
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
        strokeDasharray={len}
        strokeDashoffset={len * (1 - p)}
      />
      {p >= 0.95 && <path d={`M${h1.x} ${h1.y} L${to.x} ${to.y} L${h2.x} ${h2.y}`} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />}
    </g>
  );
}
