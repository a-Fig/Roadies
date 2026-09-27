// Fonts for the animated scenes. Bepory (the brand display face) is
// personal-use licensed, so the reel never renders it: the logo is the vector
// wordmark, and text uses Google fonts picked to sit next to it.
import { loadFont as loadFredoka } from '@remotion/google-fonts/Fredoka';
import { loadFont as loadNotoEmoji } from '@remotion/google-fonts/NotoColorEmoji';
import { loadFont as loadOverpass } from '@remotion/google-fonts/Overpass';
import { loadFont as loadMarker } from '@remotion/google-fonts/PermanentMarker';
import { loadFont as loadVT323 } from '@remotion/google-fonts/VT323';

const fredoka = loadFredoka('normal', { weights: ['500', '600', '700'], subsets: ['latin'] });
// Overpass is modeled on Highway Gothic, the lettering on US road signs.
const overpass = loadOverpass('normal', { weights: ['700', '800'], subsets: ['latin'] });
const marker = loadMarker('normal', { weights: ['400'], subsets: ['latin'] });
const vt323 = loadVT323('normal', { weights: ['400'], subsets: ['latin'] });
const emoji = loadNotoEmoji('normal', { weights: ['400'], subsets: ['emoji'] });

export const FONT = {
  /** Rounded, friendly: labels, name tags, bubbles, titles. */
  display: `${fredoka.fontFamily}, ${emoji.fontFamily}, sans-serif`,
  /** Road signs. */
  sign: `${overpass.fontFamily}, sans-serif`,
  /** Hand-drawn annotations ("me" arrow). */
  marker: `${marker.fontFamily}, ${emoji.fontFamily}, cursive`,
  /** VHS on-screen display. */
  vhs: `${vt323.fontFamily}, monospace`,
} as const;
