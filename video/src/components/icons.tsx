// Icon paths from the app (web/src/components/icons.tsx), 24x24 viewBox.
import type { CSSProperties } from 'react';
import { WORDMARK } from '../../../web/src/intro/shapes';

export const MIC_PATH =
  'M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z';
export const HEADPHONES_PATH =
  'M12 3a9 9 0 0 0-9 9v7a2 2 0 0 0 2 2h2v-8H5v-1a7 7 0 0 1 14 0v1h-2v8h2a2 2 0 0 0 2-2v-7a9 9 0 0 0-9-9Z';

interface GlyphProps {
  size: number;
  color?: string;
  slashed?: boolean;
  style?: CSSProperties;
}

export const MicGlyph = ({ size, color = 'currentColor', slashed, style }: GlyphProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} style={style}>
    <path fill={color} d={MIC_PATH} />
    {slashed && <path d="M3 3.5 20.5 21" stroke={color} strokeWidth="2.6" strokeLinecap="round" />}
  </svg>
);

export const HeadphonesGlyph = ({ size, color = 'currentColor', style }: GlyphProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} style={style}>
    <path fill={color} d={HEADPHONES_PATH} />
  </svg>
);

/** Her "Roadies" wordmark (outlined type from the intro), 297x57 viewBox. Width in px; height follows. */
export const RoadiesWordmark = ({ width, color = '#f4682c', style }: { width: number; color?: string; style?: CSSProperties }) => (
  <svg viewBox="0 0 297 57" width={width} height={(width * 57) / 297} style={style} role="img" aria-label="Roadies">
    <path fill={color} d={WORDMARK.ro} />
    <path fill={color} d={WORDMARK.adies} />
  </svg>
);
