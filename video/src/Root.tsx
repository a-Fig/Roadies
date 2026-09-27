import { Composition, Folder } from 'remotion';
import { Reel, REEL_FPS, REEL_HEIGHT, REEL_WIDTH, reelDuration } from './Reel';
import { SCENE_PREVIEWS } from './scenes';

export function Root() {
  return (
    <>
      <Composition
        id="Reel"
        component={Reel}
        width={REEL_WIDTH}
        height={REEL_HEIGHT}
        fps={REEL_FPS}
        durationInFrames={reelDuration()}
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
