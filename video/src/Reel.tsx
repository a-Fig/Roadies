// The reel: plays a timeline built from a capture (src/timeline.ts). Capture
// shots render their visuals at capture time through <AtFrame> (src/clock.tsx),
// so the recordings and the capture-timed animations (highway, dashboard) stay
// in sync with each other and with the audio however the edit cuts and speeds.
import type { ReactNode } from 'react';
import { AbsoluteFill, Audio, Freeze, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { BRAND } from './cast';
import type { CapturedVideo } from './capture-log';
import { MemeText, Subtitle } from './Captions';
import { AtFrame, useFrame } from './clock';
import { FONT } from './components/fonts';
import { PhoneFrame, phoneScreenSize } from './components/PhoneFrame';
import { Flash } from './fx';
import { VhsRewind } from './fx/VhsRewind';
import { popIn } from './fx/anim';
import { DashboardScene, DASH_PHONE_SCREEN } from './scenes/DashboardScene';
import { EndCard } from './scenes/EndCard';
import { HighwayScene } from './scenes/HighwayScene';
import { LonelyRoadScene } from './scenes/LonelyRoadScene';
import { NerdDiagram } from './scenes/NerdDiagram';
import { cropAt, VOLUME, type CropKey, type Overlay, type Shot, type Timeline } from './timeline';

export const REEL_WIDTH = 1080;
export const REEL_HEIGHT = 1920;
export const REEL_FPS = 30;

export interface ReelProps {
  /** Filled in by calculateMetadata (Root.tsx) from the latest capture. */
  timeline: Timeline | null;
  [key: string]: unknown;
}

/** The projector's viewport, in CSS px (crops are in these). */
const PROJECTOR = { width: 1080, height: 1920 };
/** The hero's phone viewport, in CSS px. */
const PHONE = { width: 390, height: 844 };
/** Where the hero's phone sits on hero shots. */
export const HERO_PHONE = { width: 560, left: (REEL_WIDTH - 560) / 2, top: 330 };
/** Card shots: the crop floats at this width, centered in TikTok's safe area. */
const CARD = { width: 820, top: 330 };

export function Reel({ timeline }: ReelProps) {
  if (!timeline) {
    return (
      <AbsoluteFill style={{ background: BRAND.ink, color: BRAND.cream, fontFamily: FONT.display, fontSize: 48, padding: 80 }}>
        No capture yet: run `npm run capture` first.
      </AbsoluteFill>
    );
  }
  const tl = timeline;
  return (
    <AbsoluteFill style={{ background: BRAND.ink }}>
      {tl.shots.map((shot, i) => (
        <Sequence key={`shot-${i}`} from={shot.start} durationInFrames={shot.frames} name={shotName(shot)}>
          <ShotView shot={shot} tl={tl} />
        </Sequence>
      ))}
      {tl.overlays.map((o, i) => (
        <Sequence key={`overlay-${i}`} from={o.from} durationInFrames={o.to - o.from} name={o.kind} layout="none">
          <OverlayView overlay={o} />
        </Sequence>
      ))}
      {tl.audio.map((a) => (
        <Sequence key={a.key} from={a.from} durationInFrames={a.frames} name={a.key} layout="none">
          <Audio src={staticFile(a.src)} volume={a.volume} playbackRate={a.rate} />
        </Sequence>
      ))}
      {tl.bed.map((r, i) => {
        const len = r.to - r.from;
        const fade = Math.min(10, Math.floor(len / 3)); // the intro's runs only up to the record scratch
        return (
          <Sequence key={`bed-${i}`} from={r.from} durationInFrames={len} name="traffic" layout="none">
            <Audio
              src={staticFile('sfx/traffic.mp3')}
              loop
              volume={(f) => VOLUME.bed * interpolate(f, [0, fade, len - fade, len], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}

const shotName = (s: Shot) => (s.visual.kind === 'anim' ? s.visual.scene : `${s.visual.kind}${s.speed !== 1 ? ` ${s.speed}x` : ''}${s.hold ? ' hold' : ''}`);

/** Renders `children` at capture time for this shot's frame. */
function CaptureClock({ shot, children }: { shot: Shot; children: ReactNode }) {
  const frame = useCurrentFrame();
  const at = shot.hold ? shot.from! : shot.from! + frame * shot.speed;
  return <AtFrame frame={Math.round(at)}>{children}</AtFrame>;
}

function ShotView({ shot, tl }: { shot: Shot; tl: Timeline }) {
  const v = shot.visual;
  if (v.kind === 'anim') {
    switch (v.scene) {
      case 'freeze':
        return <HighwayScene {...tl.freeze} />;
      case 'vhs':
        return (
          <VhsRewind settleAt={tl.vhs.settle}>
            <VhsLanding tl={tl} />
          </VhsRewind>
        );
      case 'lonely':
        return <LonelyRoadScene place={tl.lonerPlace} countdownFrom={100_000} zoomOffAt={null} mergedLabel={null} />;
      case 'endcard':
        return <EndCard />;
      case 'nerds':
        return <NerdDiagram steps={tl.nerdSteps} />;
    }
  }
  return (
    <CaptureClock shot={shot}>
      {v.kind === 'presenter' && <ProjectorView video={tl.videos.presenter} offset={tl.videoOffset.presenter} crop={v.crop} speed={shot.speed} />}
      {v.kind === 'hero' && <HeroView video={tl.videos.hero} offset={tl.videoOffset.hero} />}
      {v.kind === 'highway' && <HighwayScene {...tl.highway} />}
      {v.kind === 'dashboard' && (
        <DashboardScene sayBubble={tl.dashboard.sayBubble} boomAt={tl.dashboard.boomAt} boomHold={45}>
          <CapturedVideoAt video={tl.videos.hero} offset={tl.videoOffset.hero} width={DASH_PHONE_SCREEN.width} height={DASH_PHONE_SCREEN.height} />
        </DashboardScene>
      )}
    </CaptureClock>
  );
}

/**
 * Beat 2: the jam rewinds (the frozen highway running backward), then the tape
 * lands on the projector at `tl.vhs.land` and plays on from there.
 */
function VhsLanding({ tl }: { tl: Timeline }) {
  const frame = useCurrentFrame();
  const { settle, land, crop } = tl.vhs;
  if (frame < settle) {
    return (
      <AtFrame frame={Math.max(0, 180 - frame * 3)}>
        <HighwayScene {...tl.freeze} freezeAt={undefined} />
      </AtFrame>
    );
  }
  return (
    <AtFrame frame={Math.round(land + frame - settle)}>
      <ProjectorView video={tl.videos.presenter} offset={tl.videoOffset.presenter} crop={crop} speed={1} />
    </AtFrame>
  );
}

/**
 * A recording at the current (capture) frame, scaled to `width` x `height`.
 * It seeks with `trimBefore` from a frozen frame 0, since <Freeze> can't reach
 * frames past the reel's length.
 */
function CapturedVideoAt({ video, offset, width, height }: { video: CapturedVideo; offset: number; width: number; height: number }) {
  const frame = useFrame();
  const at = Math.min(video.frames - 1, Math.max(0, Math.round(frame - offset)));
  return (
    <Freeze frame={0}>
      <OffthreadVideo src={staticFile(video.file)} trimBefore={at} muted style={{ width, height, objectFit: 'cover', display: 'block' }} />
    </Freeze>
  );
}

/** The projector recording through a crop: filling the reel, or as a floating card over itself blurred. */
function ProjectorView({ video, offset, crop: keys, speed }: { video: CapturedVideo; offset: number; crop: CropKey[]; speed: number }) {
  const frame = useFrame(); // capture frame
  const crop = cropAt(keys, frame);
  const window = (scale: number, x: number, y: number) => (
    <div style={{ position: 'absolute', left: -x * scale, top: -y * scale }}>
      <CapturedVideoAt video={video} offset={offset} width={PROJECTOR.width * scale} height={PROJECTOR.height * scale} />
    </div>
  );
  if (crop.h === undefined) {
    return <AbsoluteFill style={{ overflow: 'hidden', background: '#111' }}>{window(REEL_WIDTH / crop.w, crop.x, crop.y)}</AbsoluteFill>;
  }
  const scale = CARD.width / crop.w;
  const height = crop.h * scale;
  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: '#111' }}>
      <AbsoluteFill style={{ filter: 'blur(22px) brightness(0.45) saturate(1.2)', transform: 'scale(1.08)' }}>{window(1, 0, 0)}</AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          left: (REEL_WIDTH - CARD.width) / 2 - 40,
          top: CARD.top,
          width: CARD.width,
          height,
          overflow: 'hidden',
          borderRadius: 36,
          boxShadow: '0 30px 80px rgba(0,0,0,0.55), 0 0 0 3px rgba(255,255,255,0.14)',
        }}
      >
        {window(scale, crop.x, crop.y)}
        {speed >= 2 && <SpeedBadge speed={speed} />}
      </div>
    </AbsoluteFill>
  );
}

function SpeedBadge({ speed }: { speed: number }) {
  return (
    <div
      style={{
        position: 'absolute',
        right: 18,
        bottom: 18,
        padding: '6px 16px',
        borderRadius: 999,
        background: 'rgba(0,0,0,0.6)',
        color: '#fff',
        fontFamily: FONT.display,
        fontWeight: 700,
        fontSize: 30,
      }}
    >
      ⏩ {speed}x
    </div>
  );
}

/** The hero's phone, upright in a bezel over the brand background. */
function HeroView({ video, offset }: { video: CapturedVideo; offset: number }) {
  const screen = phoneScreenSize(HERO_PHONE.width);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 38%, ${BRAND.bubble} 0%, ${BRAND.cream} 70%)` }}>
      <PhoneFrame width={HERO_PHONE.width} style={{ position: 'absolute', left: HERO_PHONE.left, top: HERO_PHONE.top }}>
        <CapturedVideoAt video={video} offset={offset} width={screen.width} height={screen.height} />
      </PhoneFrame>
    </AbsoluteFill>
  );
}

/** A point on the hero's phone (its CSS px) in reel px. */
function heroPoint(x: number, y: number) {
  const screen = phoneScreenSize(HERO_PHONE.width);
  const scale = screen.width / PHONE.width;
  return { x: HERO_PHONE.left + screen.bezel + x * scale, y: HERO_PHONE.top + screen.bezel + y * scale };
}

function OverlayView({ overlay: o }: { overlay: Overlay }) {
  switch (o.kind) {
    case 'meme':
      return <MemeText lines={o.lines} y={o.y} size={o.size} tilt={o.tilt} />;
    case 'subtitle':
      return <Subtitle line={o.line} accent={o.accent} playbackRate={o.rate} y={o.y} />;
    case 'flash':
      return <Flash at={0} duration={o.to - o.from} color={o.color} />;
    case 'tap':
      return <TapRipple {...heroPoint(o.x, o.y)} />;
  }
}

/** A fingertip press and a ripple, where the hero tapped. */
function TapRipple({ x, y }: { x: number; y: number }) {
  const frame = useCurrentFrame();
  const press = popIn(frame, 0, REEL_FPS, 8);
  const ripple = interpolate(frame, [3, 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: x - 110 * ripple,
          top: y - 110 * ripple,
          width: 220 * ripple,
          height: 220 * ripple,
          borderRadius: '50%',
          border: `6px solid ${BRAND.orange}`,
          opacity: 1 - ripple,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: x - 34,
          top: y - 34,
          width: 68,
          height: 68,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.75)',
          boxShadow: '0 4px 18px rgba(0,0,0,0.3)',
          transform: `scale(${0.6 + 0.4 * press})`,
          opacity: frame < 12 ? 1 : 1 - (frame - 12) / 6,
        }}
      />
    </>
  );
}
