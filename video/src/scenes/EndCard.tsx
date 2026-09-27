// End card: the wordmark, the tagline with its command in a brand bubble
// pill, an optional URL, and the whole cast hopping along a little road.
import { Fragment } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { BRAND, CAST, type CastId } from '../cast';
import { CarArt, carHeight } from '../components/CarArt';
import { FONT } from '../components/fonts';
import { RoadiesWordmark } from '../components/icons';
import { popIn } from '../fx/anim';

export interface EndCardProps {
  /** A "quoted" word renders as a bubble pill. Default 'say "unmute" to say hi'. */
  tagline?: string;
  /** Shown under the tagline in teal, e.g. 'roadies.app'. Default none. */
  url?: string;
}

const ORDER: CastId[] = ['hero', 'prius', 'tacoma', 'miata', 'wrangler', 'mustang'];
const CAR_W = 128;
const STEP = 138;
const ROAD_Y = 1010;

export function EndCard({ tagline = 'say "unmute" to say hi', url }: EndCardProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const mark = popIn(frame, 0, fps, 9);
  const tag = popIn(frame, 10, fps);
  const link = popIn(frame, 18, fps);
  const parts = tagline.split(/"([^"]+)"/);
  const rowLeft = 510 - ((ORDER.length - 1) * STEP) / 2; // nudged left of the right-hand app buttons

  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 38%, #ffe6d2 0%, ${BRAND.cream} 60%)`, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 160, top: 360, transform: `scale(${mark})`, transformOrigin: '50% 50%' }}>
        <RoadiesWordmark width={760} />
      </div>
      <div
        style={{
          position: 'absolute',
          left: 60,
          right: 60,
          top: 600,
          textAlign: 'center',
          fontFamily: FONT.display,
          fontWeight: 700,
          fontSize: 70,
          color: BRAND.ink,
          transform: `scale(${tag})`,
        }}
      >
        {parts.map((p, i) =>
          i % 2 ? (
            <span key={i} style={{ display: 'inline-block', background: BRAND.bubble, color: '#000', borderRadius: 999, padding: '2px 30px 8px', margin: '0 6px' }}>
              {p}
            </span>
          ) : (
            <Fragment key={i}>{p}</Fragment>
          ),
        )}
      </div>
      {url && (
        <div
          style={{
            position: 'absolute',
            left: 60,
            right: 60,
            top: 740,
            textAlign: 'center',
            fontFamily: FONT.display,
            fontWeight: 600,
            fontSize: 52,
            color: BRAND.teal,
            transform: `scale(${link})`,
          }}
        >
          {url}
        </div>
      )}

      {/* A little road with the whole cast hopping along. */}
      <div style={{ position: 'absolute', left: 0, top: ROAD_Y - 6, width: 1080, height: 70, background: '#5d5350' }} />
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: ROAD_Y + 24,
          width: 1080,
          height: 8,
          backgroundImage: `repeating-linear-gradient(90deg, ${BRAND.cream} 0 50px, transparent 50px 100px)`,
          backgroundPosition: `${-frame * 6}px 0`,
          opacity: 0.8,
        }}
      />
      {ORDER.map((id, i) => {
        const enter = popIn(frame, 16 + i * 4, fps, 13);
        const hop = Math.abs(Math.sin((frame - i * 5) / 6)) * 34 * enter;
        const h = carHeight(CAR_W);
        const x = rowLeft + i * STEP - CAR_W / 2 - (1 - enter) * 900;
        return (
          <Fragment key={id}>
            <div
              style={{
                position: 'absolute',
                left: x + CAR_W * 0.12,
                top: ROAD_Y - 10,
                width: CAR_W * 0.76,
                height: 14,
                borderRadius: '50%',
                background: 'rgba(42,31,31,0.3)',
                transform: `scale(${1 - hop / 90})`,
              }}
            />
            <div style={{ position: 'absolute', left: x, top: ROAD_Y - h - hop }}>
              <CarArt color={CAST[id].hex} width={CAR_W} brakeGlow={0} />
            </div>
          </Fragment>
        );
      })}
    </AbsoluteFill>
  );
}
