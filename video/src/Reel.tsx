import { AbsoluteFill } from 'remotion';
import { BRAND } from './cast';

export const REEL_WIDTH = 1080;
export const REEL_HEIGHT = 1920;
export const REEL_FPS = 30;

/** Total length; replaced by the beat timeline once voices and captures exist. */
export const reelDuration = (): number => 60 * REEL_FPS;

export function Reel() {
  return <AbsoluteFill style={{ background: BRAND.ink }} />;
}
