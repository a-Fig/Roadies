// The brand's speech bubble (web/src/brand.css --brand-bubble, the intro's
// tail shape from web/src/intro/shapes.ts), popping in and out on cue.
import type { CSSProperties } from 'react';
import { useVideoConfig } from 'remotion';
import { BUBBLE_TAIL } from '../../../web/src/intro/shapes';
import { BRAND } from '../cast';
import { useFrame } from '../clock';
import { popWindow } from '../fx/anim';
import { FONT } from './fonts';

export type TailSide = 'down' | 'down-left' | 'down-right' | 'up';

export interface SpeechBubbleProps {
  text: string;
  /** Frames (relative to the enclosing sequence) the bubble is visible: [from, to). */
  from: number;
  to: number;
  /** Where the tail points. Default 'down' (at the speaker below). */
  tail?: TailSide;
  /** Default 560 px. */
  maxWidth?: number;
  /** Fixed width in px (text wraps inside); default: fit the text up to `maxWidth`. */
  width?: number;
  /** Tail position in px from the bubble's left edge; overrides the `tail` side's default. */
  tailX?: number;
  /** Default 40 px. */
  fontSize?: number;
  /** Positioning (absolute) is up to the caller; the bubble grows from its tail. */
  style?: CSSProperties;
}

const TAIL_SCALE = 3.4;

export function SpeechBubble({ text, from, to, tail = 'down', maxWidth = 560, width, tailX: tailPx, fontSize = 40, style }: SpeechBubbleProps) {
  const frame = useFrame();
  const { fps } = useVideoConfig();
  const s = popWindow(frame, from, to, fps);
  if (s <= 0) return null;
  const tw = BUBBLE_TAIL.w * TAIL_SCALE;
  const th = BUBBLE_TAIL.h * TAIL_SCALE;
  const up = tail === 'up';
  const tailX =
    tailPx !== undefined ? `${tailPx}px` : tail === 'down-left' ? '18%' : tail === 'down-right' ? '82%' : '50%';
  return (
    <div
      style={{
        position: 'absolute',
        transform: `scale(${s})`,
        transformOrigin: `${tailX} ${up ? '0%' : '100%'}`,
        ...style,
      }}
    >
      <div
        style={{
          position: 'relative',
          maxWidth: width ?? maxWidth,
          width: width ?? 'max-content',
          boxSizing: 'border-box',
          padding: `${fontSize * 0.5}px ${fontSize * 0.75}px`,
          marginTop: up ? th - 2 : 0,
          marginBottom: up ? 0 : th - 2,
          background: BRAND.bubble,
          color: '#000',
          borderRadius: fontSize * 1.1,
          fontFamily: FONT.display,
          fontWeight: 600,
          fontSize,
          lineHeight: 1.18,
          textAlign: 'center',
          boxShadow: '0 6px 0 rgba(42,31,31,0.12)',
        }}
      >
        {text}
        <svg
          width={tw}
          height={th}
          viewBox={`0 0 ${BUBBLE_TAIL.w} ${BUBBLE_TAIL.h}`}
          style={{
            position: 'absolute',
            left: `calc(${tailX} - ${tw / 2}px)`,
            [up ? 'top' : 'bottom']: -th + 2,
            // The source tail points up; flip it to point at a speaker below.
            transform: `${up ? '' : 'scaleY(-1)'} ${tail === 'down-left' ? 'scaleX(-1)' : ''}`,
          }}
        >
          <path d={BUBBLE_TAIL.d} fill={BRAND.bubble} />
        </svg>
      </div>
    </div>
  );
}
