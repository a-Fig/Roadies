// A cartoon car seen from behind (through the windshield), in the same soft
// style as the app's side-view car art.
import type { CSSProperties } from 'react';
import { BRAND } from '../cast';
import { FONT } from './fonts';

export interface CarRearProps {
  color: string;
  /** Width in px; height is 0.75 x width. */
  width: number;
  /** 0..1: brake lights from dim to fully lit with a glow. Default 1. */
  brake?: number;
  plate?: string;
  style?: CSSProperties;
}

export const carRearHeight = (width: number) => width * 0.75;

export function CarRear({ color, width, brake = 1, plate = 'JAM 101', style }: CarRearProps) {
  const lit = 0.35 + 0.65 * brake;
  return (
    <svg width={width} height={carRearHeight(width)} viewBox="0 0 200 150" style={{ overflow: 'visible', ...style }}>
      <ellipse cx="100" cy="146" rx="98" ry="7" fill="rgba(42,31,31,0.28)" />
      <rect x="16" y="112" width="34" height="34" rx="8" fill="#3a3232" />
      <rect x="150" y="112" width="34" height="34" rx="8" fill="#3a3232" />
      {/* Cabin and rear window. */}
      <path d="M38 70 L52 22 Q56 12 68 12 L132 12 Q144 12 148 22 L162 70 Z" fill={color} />
      <path d="M52 64 L62 28 Q64 22 72 22 L128 22 Q136 22 138 28 L148 64 Z" fill="#cfe6ea" />
      <path d="M58 60 L66 30 L78 30 L70 60 Z" fill="#fff" opacity="0.55" />
      {/* Body. */}
      <rect x="6" y="60" width="188" height="66" rx="22" fill={color} />
      <rect x="6" y="104" width="188" height="22" rx="11" fill="rgba(42,31,31,0.18)" />
      {/* Brake lights, with a glow when lit. */}
      {brake > 0.05 && (
        <g opacity={brake}>
          <ellipse cx="34" cy="83" rx="44" ry="30" fill={BRAND.brakeRed} opacity="0.35" style={{ filter: 'blur(6px)' }} />
          <ellipse cx="166" cy="83" rx="44" ry="30" fill={BRAND.brakeRed} opacity="0.35" style={{ filter: 'blur(6px)' }} />
          <rect x="80" y="4" width="40" height="14" rx="7" fill={BRAND.brakeRed} opacity="0.4" style={{ filter: 'blur(4px)' }} />
        </g>
      )}
      <rect x="14" y="72" width="42" height="22" rx="10" fill={BRAND.brakeRed} opacity={lit} />
      <rect x="144" y="72" width="42" height="22" rx="10" fill={BRAND.brakeRed} opacity={lit} />
      <rect x="84" y="8" width="32" height="6" rx="3" fill={BRAND.brakeRed} opacity={lit} />
      {/* Plate. */}
      {plate && (
        <>
          <rect x="72" y="86" width="56" height="24" rx="5" fill={BRAND.cream} stroke="rgba(42,31,31,0.35)" strokeWidth="1.5" />
          <text x="100" y="103" textAnchor="middle" fontFamily={FONT.sign} fontWeight={800} fontSize="12.5" fill={BRAND.ink}>
            {plate}
          </text>
        </>
      )}
    </svg>
  );
}
