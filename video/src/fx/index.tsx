// Reusable punch-up effects: shake, boom zoom, flash, speed lines, countdown.
// Frame props are relative to the enclosing <Sequence> (or the <AtFrame> clock).
import type { CSSProperties, ReactNode } from 'react';
import { AbsoluteFill, interpolate, random, useVideoConfig } from 'remotion';
import { BRAND } from '../cast';
import { useFrame } from '../clock';
import { FONT } from '../components/fonts';
import { popIn, progress, shakeAt } from './anim';

export interface ShakeProps {
  /** Frame the shake starts. */
  at: number;
  /** Length in frames. Default 12. */
  duration?: number;
  /** Peak offset in px. Default 18. */
  intensity?: number;
  children: ReactNode;
}

/** Camera shake that decays to nothing. */
export function Shake({ at, duration = 12, intensity = 18, children }: ShakeProps) {
  const frame = useFrame();
  const s = shakeAt(frame, at, duration, intensity);
  return (
    <AbsoluteFill style={{ transform: `translate(${s.x}px, ${s.y}px) rotate(${s.r}deg)` }}>{children}</AbsoluteFill>
  );
}

export interface BoomZoomProps {
  /** Frame of the "vine boom" hit. */
  at: number;
  /** Zoom reached after the hit. Default 1.3. */
  scale?: number;
  /** Zoom origin in px of the 1080x1920 canvas (the thing to punch into). Default center. */
  originX?: number;
  originY?: number;
  /** Frames to hold the zoom before easing back out; omit to stay zoomed. */
  hold?: number;
  children: ReactNode;
}

/** Punch-in zoom with overshoot and a shake, the "vine boom" moment. */
export function BoomZoom({ at, scale = 1.3, originX = 540, originY = 960, hold, children }: BoomZoomProps) {
  const frame = useFrame();
  const { fps } = useVideoConfig();
  const inP = popIn(frame, at, fps, 9);
  const outP = hold === undefined ? 0 : progress(frame, at + hold, at + hold + 10);
  const z = 1 + (scale - 1) * inP * (1 - outP);
  const s = shakeAt(frame, at, 14, 22);
  return (
    <AbsoluteFill
      style={{
        transformOrigin: `${originX}px ${originY}px`,
        transform: `translate(${s.x}px, ${s.y}px) scale(${z}) rotate(${s.r}deg)`,
      }}
    >
      {children}
    </AbsoluteFill>
  );
}

export interface FlashProps {
  at: number;
  /** Fade-out length in frames. Default 8. */
  duration?: number;
  color?: string;
  /** Peak opacity. Default 0.9. */
  opacity?: number;
}

/** Full-screen flash that fades out. */
export function Flash({ at, duration = 8, color = '#ffffff', opacity = 0.9 }: FlashProps) {
  const frame = useFrame();
  if (frame < at || frame > at + duration) return null;
  const o = interpolate(frame, [at, at + duration], [opacity, 0]);
  return <AbsoluteFill style={{ background: color, opacity: o, pointerEvents: 'none' }} />;
}

export interface SpeedLinesProps {
  from: number;
  /** Frame the lines stop. Default: never. */
  to?: number;
  /** Which way the thing is moving; lines stream the other way. Default 'right'. */
  direction?: 'right' | 'left';
  color?: string;
  /** Number of streaks. Default 26. */
  count?: number;
  /** Vertical band the streaks fill, px. Default the whole canvas. */
  top?: number;
  bottom?: number;
  seed?: string;
}

/** Horizontal anime speed streaks. */
export function SpeedLines({ from, to = Infinity, direction = 'right', color = BRAND.cream, count = 26, top = 0, bottom = 1920, seed = 'speed' }: SpeedLinesProps) {
  const frame = useFrame();
  if (frame < from || frame >= to) return null;
  const t = frame - from;
  const fadeIn = progress(frame, from, from + 4);
  const fadeOut = to === Infinity ? 1 : 1 - progress(frame, to - 5, to);
  const dir = direction === 'right' ? -1 : 1;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', opacity: fadeIn * fadeOut }}>
      {Array.from({ length: count }, (_, i) => {
        const y = top + random(`${seed}-y-${i}`) * (bottom - top);
        const len = 180 + random(`${seed}-l-${i}`) * 420;
        const speed = 60 + random(`${seed}-s-${i}`) * 70;
        const span = 1080 + len * 2;
        const x0 = random(`${seed}-x-${i}`) * span;
        const x = (((x0 + dir * t * speed) % span) + span) % span - len;
        const thick = 3 + random(`${seed}-t-${i}`) * 7;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: len,
              height: thick,
              borderRadius: thick,
              background: `linear-gradient(${direction === 'right' ? 90 : 270}deg, transparent, ${color})`,
              opacity: 0.55 + random(`${seed}-o-${i}`) * 0.45,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
}

export interface CountdownProps {
  /** Frame the count starts at `start`. */
  from: number;
  /** Frame it reaches `end`. */
  to: number;
  /** Default 15. */
  start?: number;
  /** Default 0. */
  end?: number;
  /** Center of the digits in px. Default (540, 520). */
  x?: number;
  y?: number;
  /** Digit height in px. Default 320. */
  size?: number;
  /** Small line above the digits. Default none. */
  label?: string;
  color?: string;
  style?: CSSProperties;
}

/** Giant sped-up countdown; each new number pops, the last three turn red. */
export function Countdown({ from, to, start = 15, end = 0, x = 540, y = 520, size = 320, label, color = BRAND.cream, style }: CountdownProps) {
  const frame = useFrame();
  const { fps } = useVideoConfig();
  if (frame < from) return null;
  const p = progress(frame, from, to);
  const value = Math.round(start + (end - start) * p);
  // The frame this value first appeared, so every tick re-pops.
  const steps = Math.abs(start - end) || 1;
  const tickFrame = from + ((Math.abs(value - start) - 0.5) / steps) * (to - from);
  const pop = value === start ? popIn(frame, from, fps, 8) : popIn(frame, Math.max(from, Math.ceil(tickFrame)), fps, 8);
  const hot = value <= 3;
  const fade = 1 - progress(frame, to + 12, to + 20);
  return (
    <div
      style={{
        position: 'absolute',
        left: x - 400,
        top: y - size * 0.75,
        width: 800,
        textAlign: 'center',
        fontFamily: FONT.display,
        opacity: fade,
        ...style,
      }}
    >
      {label && (
        <div style={{ fontSize: size * 0.17, fontWeight: 600, color, letterSpacing: 1, marginBottom: -size * 0.05 }}>{label}</div>
      )}
      <div
        style={{
          fontSize: size,
          lineHeight: 1,
          fontWeight: 700,
          color: hot ? BRAND.brakeRed : color,
          transform: `scale(${0.6 + 0.4 * pop})`,
          textShadow: `0 ${size * 0.03}px 0 ${BRAND.ink}, 0 0 ${size * 0.12}px rgba(0,0,0,0.25)`,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
    </div>
  );
}
