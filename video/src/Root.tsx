import { Composition, Folder, staticFile, type CalculateMetadataFunction } from 'remotion';
import type { CaptureLog } from './capture-log';
import { Reel, REEL_FPS, REEL_HEIGHT, REEL_WIDTH, type ReelProps } from './Reel';
import { SCENE_PREVIEWS } from './scenes';
import { buildTimeline } from './timeline';

/** Lays the reel out from the latest capture (public/gen/captures/latest.json). */
const fromLatestCapture: CalculateMetadataFunction<ReelProps> = async () => {
  const latest = await fetch(staticFile('gen/captures/latest.json'));
  if (!latest.ok) return { durationInFrames: 10 * REEL_FPS, props: { timeline: null } };
  const { take } = (await latest.json()) as { take: string };
  const log = (await (await fetch(staticFile(`gen/captures/${take}/events.json`))).json()) as CaptureLog;
  const timeline = buildTimeline(log);
  return { durationInFrames: timeline.duration, props: { timeline } };
};

export function Root() {
  return (
    <>
      <Composition
        id="Reel"
        component={Reel}
        width={REEL_WIDTH}
        height={REEL_HEIGHT}
        fps={REEL_FPS}
        durationInFrames={10 * REEL_FPS}
        defaultProps={{ timeline: null }}
        calculateMetadata={fromLatestCapture}
      />
      {/* Each scene on its own, for iterating in `npm run studio`. */}
      <Folder name="Scenes">
        {SCENE_PREVIEWS.map((s) => (
          <Composition
            key={s.id}
            id={s.id}
            component={s.component}
            width={REEL_WIDTH}
            height={REEL_HEIGHT}
            fps={REEL_FPS}
            durationInFrames={s.durationInFrames}
            defaultProps={s.defaultProps}
          />
        ))}
      </Folder>
    </>
  );
}
