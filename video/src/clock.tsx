// The frame a scene renders at. Shots cut from a capture render their scenes at
// capture frames, which run past the reel's own length; Remotion clamps
// <Freeze> (and so useCurrentFrame) to the composition, so they get this
// context instead. Outside it, scenes see the usual Sequence-relative frame.
import { createContext, useContext, type ReactNode } from 'react';
import { useCurrentFrame } from 'remotion';

const SceneFrame = createContext<number | null>(null);

/** Renders `children` at `frame` (any size, unclamped). */
export function AtFrame({ frame, children }: { frame: number; children: ReactNode }) {
  return <SceneFrame.Provider value={frame}>{children}</SceneFrame.Provider>;
}

/** The frame set by the nearest <AtFrame>, else useCurrentFrame(). */
export function useFrame(): number {
  const frame = useCurrentFrame();
  return useContext(SceneFrame) ?? frame;
}
