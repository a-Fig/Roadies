// The reel's two kinds of on-screen text, TikTok style: word-by-word subtitles
// of whoever is talking (timed by ElevenLabs forced alignment, src/media.json),
// and the script's meme captions in TikTok's white "classic" text boxes.
import type { CSSProperties } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { BRAND, CAST } from './cast';
import { FONT } from './components/fonts';
import { popIn } from './fx/anim';
import type { LineId } from './lines';
import type { Media, Word } from './media';
import mediaJson from './media.json';

const media = mediaJson as Media;

/** The TikTok UI covers the bottom ~22% and the right edge; text stays clear of both. */
export const SAFE = { top: 200, bottom: 1480, left: 70, right: 930 } as const;

/** Word timings of a generated line. */
export const wordsOf = (id: LineId): Word[] => media.voices[id]?.words ?? [];
/** Length of a generated line in seconds. */
export const durationOf = (id: LineId): number => media.voices[id]!.duration;

interface Chunk {
  words: Word[];
  start: number;
  end: number;
}

/** Groups words into short subtitle chunks: at most 3 words, broken after punctuation. */
function chunks(words: Word[]): Chunk[] {
  const out: Chunk[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (cur.length) out.push({ words: cur, start: cur[0]!.start, end: cur.at(-1)!.end });
    cur = [];
  };
  for (const w of words) {
    cur.push(w);
    if (cur.length >= 3 || /[.,!?…—-]$/.test(w.text)) flush();
  }
  flush();
  return out;
}

const tidy = (text: string) => text.toLowerCase().replace(/[.,]$/, '');

export interface SubtitleProps {
  /** The line being spoken; its Sequence starts where the clip starts. */
  line: LineId;
  /** Accent for the word being said (defaults to the speaker's car color or brand orange). */
  accent?: string;
  /** Speed the clip plays at (for sped-up capture shots). */
  playbackRate?: number;
  y?: number;
}

/** Word-pop subtitles for one line, inside a Sequence that starts with the clip. */
export function Subtitle({ line, accent = BRAND.orange, playbackRate = 1, y = 1180 }: SubtitleProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = (frame / fps) * playbackRate;
  const all = chunks(wordsOf(line));
  // Hold each chunk until the next one starts (or a beat after its last word).
  const idx = all.findIndex((c, i) => t >= c.start - 0.05 && t < (all[i + 1]?.start ?? c.end + 0.4) - 0.05);
  const chunk = all[idx];
  if (!chunk) return null;
  const chunkFrame = Math.round(((chunk.start - 0.05) * fps) / playbackRate);
  const s = popIn(frame, chunkFrame, fps, 14);
  return (
    <div
      style={{
        position: 'absolute',
        left: SAFE.left,
        right: 1080 - SAFE.right,
        top: y,
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: '0 22px',
        transform: `scale(${0.85 + 0.15 * s})`,
        fontFamily: FONT.display,
        fontWeight: 700,
        fontSize: 84,
        lineHeight: 1.08,
        textAlign: 'center',
      }}
    >
      {chunk.words.map((w, i) => {
        const now = t >= w.start - 0.03;
        const current = now && !(chunk.words[i + 1] && t >= chunk.words[i + 1]!.start - 0.03);
        return (
          <span
            key={i}
            style={{
              color: now ? '#ffffff' : 'rgba(255,255,255,0.55)',
              WebkitTextStroke: `14px ${BRAND.ink}`,
              paintOrder: 'stroke fill',
              textShadow: `0 6px 0 ${BRAND.ink}`,
              ...(current ? { color: accent } : {}),
            }}
          >
            {tidy(w.text)}
          </span>
        );
      })}
    </div>
  );
}

/** A speaker's accent color for subtitles. */
export const accentOf = (speaker: string): string =>
  speaker in CAST ? CAST[speaker as keyof typeof CAST].hex : BRAND.orange;

export interface MemeTextProps {
  /** One or more lines; each gets its own white box, like TikTok's classic text style. */
  lines: string[];
  /** Frame (relative to the Sequence) the text pops in. Default 0. */
  at?: number;
  y?: number;
  size?: number;
  /** Tilt in degrees, for the more chaotic captions. */
  tilt?: number;
  style?: CSSProperties;
}

/** TikTok "classic" caption: black text on rounded white boxes, one per line. */
export function MemeText({ lines, at = 0, y = 250, size = 58, tilt = 0, style }: MemeTextProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = popIn(frame, at, fps, 12);
  if (s <= 0) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: SAFE.left,
        right: 1080 - SAFE.right,
        top: y,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        transform: `scale(${s}) rotate(${tilt}deg)`,
        transformOrigin: '50% 0%',
        ...style,
      }}
    >
      {lines.map((l, i) => (
        <div
          key={i}
          style={{
            background: '#ffffff',
            color: '#111111',
            fontFamily: FONT.display,
            fontWeight: 600,
            fontSize: size,
            lineHeight: 1.18,
            padding: `${size * 0.14}px ${size * 0.3}px`,
            borderRadius: size * 0.28,
            marginTop: i ? -size * 0.12 : 0,
            textAlign: 'center',
            boxShadow: '0 6px 24px rgba(0,0,0,0.18)',
          }}
        >
          {l}
        </div>
      ))}
    </div>
  );
}
