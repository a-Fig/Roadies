// VHS rewind: chromatic split, scanlines, a rolling tracking-noise band,
// jitter, "◀◀ REW" and a center title. Wraps any scene.
import { useId, type ReactNode } from 'react';
import { AbsoluteFill, Freeze, random, Sequence, useCurrentFrame } from 'remotion';
import { FONT } from '../components/fonts';
import { progress } from './anim';

export interface VhsRewindProps {
  children?: ReactNode;
  /** Center title. Default '40 MINUTES EARLIER'; null hides it. */
  title?: string | null;
  /** Title visible [titleFrom, titleTo). Defaults 8, 52. */
  titleFrom?: number;
  titleTo?: number;
  /** The tape "lands": the effect fades out over 10 frames and "▶ PLAY" shows briefly. Default 60. */
  settleAt?: number;
  /**
   * Optional: rewind the children. Until `settleAt` they see frame
   * `max(0, rewindFrom - frame * rewindSpeed)` (running backward); from
   * `settleAt` on they play forward from their frame 0.
   * Omitted: the children just see the normal frame.
   */
  rewindFrom?: number;
  /** Default 3 frames of footage per frame. */
  rewindSpeed?: number;
}

export function VhsRewind({
  children,
  title = '40 MINUTES EARLIER',
  titleFrom = 8,
  titleTo = 52,
  settleAt = 60,
  rewindFrom,
  rewindSpeed = 3,
}: VhsRewindProps) {
  const frame = useCurrentFrame();
  const filterId = `vhs${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const fx = 1 - progress(frame, settleAt, settleAt + 10); // effect strength
  const split = 9 * fx;
  const jx = (random(`vhs-jx-${frame}`) - 0.5) * 8 * fx;
  const jy = (random(`vhs-jy-${frame}`) - 0.5) * 14 * fx;

  let scene: ReactNode = children;
  if (rewindFrom !== undefined) {
    scene =
      frame < settleAt ? (
        <Freeze frame={Math.max(0, Math.round(rewindFrom - frame * rewindSpeed))}>{children}</Freeze>
      ) : (
        <Sequence from={settleAt} layout="none">
          {children}
        </Sequence>
      );
  }

  const bandY = ((frame * 41) % 2300) - 180;
  const titleOn = title && frame >= titleFrom && frame < titleTo && !(frame - titleFrom < 8 && (frame - titleFrom) % 3 === 1);

  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: '#000' }}>
      <svg width={0} height={0} style={{ position: 'absolute' }}>
        <filter id={filterId} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" />
          <feOffset in="r" dx={split} dy={0} result="ro" />
          <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g" />
          <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b" />
          <feOffset in="b" dx={-split} dy={0} result="bo" />
          <feBlend in="ro" in2="g" mode="screen" result="rg" />
          <feBlend in="rg" in2="bo" mode="screen" />
        </filter>
      </svg>
      <AbsoluteFill
        style={{
          transform: `translate(${jx}px, ${jy}px)`,
          filter: fx > 0 ? `url(#${filterId}) saturate(${1 + 0.35 * fx}) contrast(${1 + 0.12 * fx})` : undefined,
        }}
      >
        {scene}
      </AbsoluteFill>

      {fx > 0 && (
        <AbsoluteFill style={{ opacity: fx, pointerEvents: 'none' }}>
          {/* Scanlines and a soft vignette. */}
          <AbsoluteFill style={{ backgroundImage: 'repeating-linear-gradient(180deg, rgba(0,0,0,0.22) 0 2px, transparent 2px 5px)' }} />
          <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 50% 50%, transparent 60%, rgba(0,0,0,0.45) 100%)' }} />
          {/* Tracking noise band rolling down the screen. */}
          <div style={{ position: 'absolute', left: 0, top: bandY, width: 1080, height: 150, background: 'rgba(255,255,255,0.07)' }}>
            {Array.from({ length: 36 }, (_, i) => (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: random(`vhs-nx-${frame}-${i}`) * 1080 - 60,
                  top: random(`vhs-ny-${frame}-${i}`) * 150,
                  width: 40 + random(`vhs-nw-${frame}-${i}`) * 260,
                  height: 2 + random(`vhs-nh-${frame}-${i}`) * 5,
                  background: i % 3 ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.5)',
                }}
              />
            ))}
          </div>
          {/* Bottom-edge head-switching noise. */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              bottom: 0,
              width: 1080,
              height: 26,
              backgroundImage: `repeating-linear-gradient(90deg, rgba(255,255,255,0.5) 0 ${3 + (frame % 5)}px, transparent ${3 + (frame % 5)}px 11px)`,
            }}
          />
        </AbsoluteFill>
      )}

      {/* On-screen display. */}
      <div style={{ position: 'absolute', left: 80, top: 170, fontFamily: FONT.vhs, fontSize: 96, color: '#fff', textShadow: '4px 0 rgba(255,0,60,0.6), -4px 0 rgba(0,220,255,0.6)', letterSpacing: 2 }}>
        {frame < settleAt ? (Math.floor(frame / 10) % 3 !== 2 ? '◀◀ REW' : '') : frame < settleAt + 24 ? '▶ PLAY' : ''}
      </div>
      {titleOn && (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', paddingBottom: 260 }}>
          <div
            style={{
              fontFamily: FONT.vhs,
              fontSize: 150,
              lineHeight: 0.95,
              color: '#fff',
              textAlign: 'center',
              width: 820,
              textShadow: '6px 0 rgba(255,0,60,0.7), -6px 0 rgba(0,220,255,0.7), 0 0 30px rgba(0,0,0,0.6)',
              letterSpacing: 4,
            }}
          >
            {title}
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
}
