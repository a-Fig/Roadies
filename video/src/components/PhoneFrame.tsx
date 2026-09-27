// A phone bezel for captured phone screens (390x844 CSS px captures are 9:19.5).
import type { CSSProperties, ReactNode } from 'react';
import { AbsoluteFill } from 'remotion';

export interface PhoneFrameProps {
  /** Outer width in px, bezel included. Default 460. */
  width?: number;
  /** The screen: typically an <OffthreadVideo> of a phone capture, sized to fill. */
  children?: ReactNode;
  /** Shown behind `children` (and when there are none). Default near-black. */
  screenBackground?: string;
  style?: CSSProperties;
}

/** Screen size inside a `width`-px frame, so a capture can be sized to fit exactly. */
export function phoneScreenSize(width = 460): { width: number; height: number; bezel: number } {
  const bezel = Math.round(width * 0.04);
  const w = width - bezel * 2;
  return { width: w, height: Math.round((w * 19.5) / 9), bezel };
}

/** Outer height of a `width`-px frame. */
export const phoneFrameHeight = (width = 460): number => {
  const s = phoneScreenSize(width);
  return s.height + s.bezel * 2;
};

export function PhoneFrame({ width = 460, children, screenBackground = '#0d0d0f', style }: PhoneFrameProps) {
  const screen = phoneScreenSize(width);
  const height = screen.height + screen.bezel * 2;
  const outerR = width * 0.15;
  const innerR = outerR - screen.bezel;
  const button = (top: number, h: number, side: 'left' | 'right') => (
    <div
      style={{
        position: 'absolute',
        [side]: -width * 0.012,
        top: height * top,
        width: width * 0.016,
        height: height * h,
        borderRadius: 4,
        background: '#2b2b30',
      }}
    />
  );
  return (
    <div style={{ position: 'relative', width, height, ...style }}>
      {button(0.18, 0.05, 'left')}
      {button(0.26, 0.09, 'left')}
      {button(0.37, 0.09, 'left')}
      {button(0.28, 0.14, 'right')}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: outerR,
          background: 'linear-gradient(145deg, #3a3a40, #121215 40%, #1d1d22)',
          boxShadow: '0 30px 60px rgba(42,31,31,0.35), inset 0 0 0 2px #4a4a52',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: screen.bezel,
          top: screen.bezel,
          width: screen.width,
          height: screen.height,
          borderRadius: innerR,
          overflow: 'hidden',
          background: screenBackground,
        }}
      >
        <AbsoluteFill>{children}</AbsoluteFill>
        {/* Dynamic island */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: screen.width * 0.03,
            width: screen.width * 0.3,
            height: screen.width * 0.085,
            transform: 'translateX(-50%)',
            borderRadius: 999,
            background: '#000',
          }}
        />
        {/* Glass sheen */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(115deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 35%)',
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  );
}
