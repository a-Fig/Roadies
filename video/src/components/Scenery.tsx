// Shared set pieces: sky, Bay Area hills, US-101 signage, the road.
import type { CSSProperties, ReactNode } from 'react';
import { random } from 'remotion';
import { BRAND } from '../cast';
import { FONT } from './fonts';

export const HIGHWAY_GREEN = '#0f6b45';
export const ASPHALT = '#5d5350';

/** Full-bleed sky gradient. `mood` 'morning' is warm cream/peach; 'gloom' is the sad blue of Gilroy. */
export function Sky({ mood = 'morning', style }: { mood?: 'morning' | 'gloom'; style?: CSSProperties }) {
  const bg =
    mood === 'morning'
      ? `linear-gradient(180deg, #ffd9bf 0%, ${BRAND.cream} 55%, #fff4dc 100%)`
      : 'linear-gradient(180deg, #5d6f8f 0%, #8d9bb3 55%, #b3bccb 100%)';
  return <div style={{ position: 'absolute', inset: 0, background: bg, ...style }} />;
}

/** A soft sun with a glow. */
export function Sun({ x, y, r = 80, color = '#f7a15f' }: { x: number; y: number; r?: number; color?: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: x - r,
        top: y - r,
        width: r * 2,
        height: r * 2,
        borderRadius: '50%',
        background: color,
        boxShadow: `0 0 ${r}px ${r * 0.6}px ${color}66`,
      }}
    />
  );
}

/**
 * Rolling hills as one SVG band. `left`/`width` in px; the band's baseline is
 * `bottom` and crests reach up to `height` above it.
 */
export function Hills({
  left,
  width,
  bottom,
  height,
  color,
  seed,
  bumps = 6,
  trees = 0,
  treeColor = '#2e7d6b',
}: {
  left: number;
  width: number;
  bottom: number;
  height: number;
  color: string;
  seed: string;
  bumps?: number;
  trees?: number;
  treeColor?: string;
}) {
  const pts: string[] = [`M0 ${height}`];
  const step = width / bumps;
  let prevY = height * 0.5;
  pts.push(`L0 ${prevY}`);
  for (let i = 0; i < bumps; i++) {
    const x1 = i * step + step * 0.5;
    const y1 = height * (0.05 + random(`${seed}-h-${i}`) * 0.45);
    const x2 = (i + 1) * step;
    const y2 = height * (0.3 + random(`${seed}-v-${i}`) * 0.4);
    pts.push(`Q${x1} ${y1 - (prevY - y1) * 0.3} ${x2} ${y2}`);
    prevY = y2;
  }
  pts.push(`L${width} ${height} Z`);
  return (
    <svg
      width={width}
      height={height}
      style={{ position: 'absolute', left, top: bottom - height, overflow: 'visible' }}
      viewBox={`0 0 ${width} ${height}`}
    >
      <path d={pts.join(' ')} fill={color} />
      {Array.from({ length: trees }, (_, i) => {
        const tx = random(`${seed}-tx-${i}`) * width;
        const tr = 14 + random(`${seed}-tr-${i}`) * 16;
        const ty = height * (0.45 + random(`${seed}-ty-${i}`) * 0.4);
        return <circle key={i} cx={tx} cy={ty} r={tr} fill={treeColor} opacity={0.9} />;
      })}
    </svg>
  );
}

/** The US route shield with a number. */
export function RouteShield({ size, route = '101' }: { size: number; route?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <path
        d="M50 8 C60 16 78 15 91 7 C96 30 98 56 87 73 C77 88 60 92 50 97 C40 92 23 88 13 73 C2 56 4 30 9 7 C22 15 40 16 50 8 Z"
        fill="#fff"
        stroke="#111"
        strokeWidth="5"
      />
      <text x="50" y="66" textAnchor="middle" fontFamily={FONT.sign} fontWeight={800} fontSize={route.length > 2 ? 34 : 44} fill="#111">
        {route}
      </text>
    </svg>
  );
}

/** A green freeway sign on two posts. `x`/`y` is the sign's top-left; posts run down to `postBottom`. */
export function FreewaySign({
  x,
  y,
  width = 460,
  postBottom,
  children,
}: {
  x: number;
  y: number;
  width?: number;
  postBottom: number;
  children: ReactNode;
}) {
  return (
    <div style={{ position: 'absolute', left: x, top: y, width }}>
      {[0.2, 0.8].map((f) => (
        <div
          key={f}
          style={{
            position: 'absolute',
            left: width * f - 7,
            top: 40,
            width: 14,
            height: postBottom - y - 40,
            background: '#8b8f93',
            boxShadow: 'inset -4px 0 0 #6d7175',
          }}
        />
      ))}
      <div
        style={{
          position: 'relative',
          background: HIGHWAY_GREEN,
          borderRadius: 14,
          border: '5px solid #fff',
          outline: `3px solid ${HIGHWAY_GREEN}`,
          padding: '14px 22px',
          color: '#fff',
          fontFamily: FONT.sign,
          boxShadow: '0 8px 0 rgba(42,31,31,0.15)',
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** The standard "101 NORTH / San Francisco" sign content. */
export function NorthboundSignContent({ scale = 1 }: { scale?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 * scale }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 * scale }}>
        <RouteShield size={78 * scale} />
        <span style={{ fontWeight: 800, fontSize: 46 * scale, letterSpacing: 2 }}>NORTH</span>
      </div>
      <span style={{ fontWeight: 700, fontSize: 50 * scale }}>San Francisco</span>
    </div>
  );
}
