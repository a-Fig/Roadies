// Small deterministic animation helpers shared by the scenes and effects.
import { interpolate, random, spring } from 'remotion';

/** 0 -> 1 springy pop-in starting at `at` (overshoots a little, TikTok-snappy). */
export const popIn = (frame: number, at: number, fps: number, damping = 11): number =>
  frame < at ? 0 : spring({ frame: frame - at, fps, config: { damping, stiffness: 180, mass: 0.7 } });

/** 1 -> 0 over `frames` ending at `to` (quick shrink-out). */
export const popOut = (frame: number, to: number, frames = 6): number =>
  interpolate(frame, [to - frames, to], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

/** Pop in at `from`, pop out at `to`: the visible scale for a transient element. */
export const popWindow = (frame: number, from: number, to: number, fps: number): number =>
  frame < from || frame >= to ? 0 : Math.min(popIn(frame, from, fps), popOut(frame, to));

/** Decaying jitter for a shake that starts at `at`: offsets in px and a rotation in degrees. */
export function shakeAt(frame: number, at: number, duration: number, intensity: number): { x: number; y: number; r: number } {
  const t = frame - at;
  if (t < 0 || t >= duration) return { x: 0, y: 0, r: 0 };
  const decay = 1 - t / duration;
  const amp = intensity * decay * decay;
  return {
    x: (random(`shake-x-${at}-${t}`) * 2 - 1) * amp,
    y: (random(`shake-y-${at}-${t}`) * 2 - 1) * amp,
    r: (random(`shake-r-${at}-${t}`) * 2 - 1) * amp * 0.08,
  };
}

/** Linear 0..1 progress of `frame` through [a, b], clamped. */
export const progress = (frame: number, a: number, b: number): number =>
  interpolate(frame, [a, b], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

/** Is `frame` inside any of the [from, to) ranges for `id`? */
export const inRanges = <T extends { from: number; to: number }>(frame: number, ranges: readonly T[]): boolean =>
  ranges.some((r) => frame >= r.from && frame < r.to);
