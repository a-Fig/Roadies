// Ported unchanged from the girlfriend's design
// (scratchpad/gf-roadies/src/intro/frames.js) - keyframes for the Roadies
// splash, lifted from her Figma file (page 1, frames 2-16). Only the types
// are new; every number, path string and formula is hers.
//
// Everything lives in "world" units: the 440x956 phone frame at 1x zoom.
// Frames 10-12 are drawn in Figma at 3.75x (300px type instead of 80px), so
// their numbers are converted back through the zoom camera below. That
// keeps the cars and masks in one coordinate space, so the zoom is a real
// camera move instead of a cross-fade.

export const STAGE = { w: 440, h: 956 };

// Zoomed-in camera: screen = world * scale + offset.
// Solved from the "R" glyph in frame 9 (80px) vs. frame 10 (300px).
export const ZOOM = { scale: 3.75, offset: { x: -221.3572, y: -1008.0 } };

// Point that stays put while zooming, i.e. where the camera pushes in.
export const ZOOM_FOCUS = {
  x: ZOOM.offset.x / (1 - ZOOM.scale),
  y: ZOOM.offset.y / (1 - ZOOM.scale),
};

const round = (v: number): number => Math.round(v * 1000) / 1000;
const fromZoom = (x: number, y: number): [number, number] => [
  (x - ZOOM.offset.x) / ZOOM.scale,
  (y - ZOOM.offset.y) / ZOOM.scale,
];

export interface CarState {
  cx: number;
  cy: number;
  w: number;
  h: number;
  rot: number;
}

// Car images are 1920x1080; "3 1" in Figma is the red car, "2 1" the teal one.
const CAR_SIZE = { red: { w: 50, h: 28 }, teal: { w: 55, h: 31 } } as const;
type CarKind = keyof typeof CAR_SIZE;

// cx/cy is the car's center, rot is CSS degrees (clockwise).
const car = (kind: CarKind, cx: number, cy: number, rot: number): CarState => ({
  cx,
  cy,
  rot,
  ...CAR_SIZE[kind],
});
const zoomCar = (cx: number, cy: number, w: number, h: number, rot: number): CarState => {
  const [x, y] = fromZoom(cx, cy);
  return { cx: x, cy: y, w: w / ZOOM.scale, h: h / ZOOM.scale, rot };
};

// Figma exports the masks as absolute M/L/H/V/Z paths relative to their own box.
// Rewrite them as M/L paths in world coordinates so MorphSVG can tween between them.
function placePath(d: string, map: (x: number, y: number) => string): string {
  const out: string[] = [];
  let x = 0;
  let y = 0;
  for (const m of d.matchAll(/([MLHVZ])([^MLHVZ]*)/g)) {
    const cmd = m[1]!;
    const n = m[2]!
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);
    if (cmd === 'Z') {
      out.push('Z');
    } else if (cmd === 'H') {
      for (const v of n) out.push('L' + map((x = v), y));
    } else if (cmd === 'V') {
      for (const v of n) out.push('L' + map(x, (y = v)));
    } else {
      for (let i = 0; i < n.length; i += 2) {
        x = n[i]!;
        y = n[i + 1]!;
        out.push((cmd === 'M' && i === 0 ? 'M' : 'L') + map(x, y));
      }
    }
  }
  return out.join('');
}

const mask = (left: number, top: number, d: string): string =>
  placePath(d, (px, py) => `${round(left + px)} ${round(top + py)}`);
const zoomMask = (left: number, top: number, d: string): string =>
  placePath(d, (px, py) => fromZoom(left + px, top + py).map(round).join(' '));

// White shapes that hide parts of the "R" while the cars draw it in.
// m6 = "Rectangle 6" (bowl side), m5 = "Rectangle 5" (stem/leg side).
const MASKS = {
  3: {
    m6: mask(104, 359, 'M0 0H37V26L49.5 29L64.5 20V45.5L37 62H0V0Z'),
    m5: mask(59, 339, 'M0 0H61V73H45L28 51.5H1.5L0 0Z'),
  },
  4: {
    m6: mask(104, 359, 'M0 0H37V26L48 37H62.5L58 55.5L37 62H0V0Z'),
    m5: mask(59, 339, 'M0 0H61V73H45L23.5 59L22.5 39H1.5L0 0Z'),
  },
  5: {
    m6: mask(104, 359, 'M0 0H37V26L44.5 36.5L54.5 58L48.5 59.5L37 62H0V0Z'),
    m5: mask(81.5, 339, 'M0 2L38.5 0V73H22.5L0.7 59V39V35L0 2Z'),
  },
  6: {
    m6: mask(104, 359, 'M0 0H37V25.5806L39 36.5V64H26H13.5L0 61V0Z'),
    m5: mask(82.2, 339, 'M3.3 30.5L0.000195313 14L37.8002 0V73H21.8002L0 59L0.000195313 40V27L3.3 30.5Z'),
  },
  7: {
    m6: mask(117.5, 359, 'M4 2L23.5 0V25.5806L18 34.5V59.5L12.5 64H0L4 62.5V2Z'),
    m5: mask(82.2, 339, 'M15.8 31V11.5L37.8002 0V73H21.8002L0 59L0.000195313 40V27L15.8 31Z'),
  },
  8: {
    m6: mask(114.5, 359, 'M12 3L26.5 0V25.5806L21 34.5L9 41.5L15.5 64H3L0 50.5L12 3Z'),
    m5: mask(82.2, 339, 'M15.2998 34.5H37.8002V0V73H21.8002L0 59L0.000195313 40V27L15.2998 34.5Z'),
  },
  9: {
    m6: mask(114.5, 359, 'M12 3L26.5 0V25.5806L23.5 30.5L6.29542 25.5806L3 41V64L0 50.5L12 3Z'),
    m5: mask(82.2, 339, 'M18.7998 35L37.8002 55V0V73H21.8002L0 59L0.000195313 40V27L18.7998 35Z'),
  },
  zoom: {
    m6: zoomMask(201, 326, 'M53.8868 13.5L119 0V115.113H97L29.9051 101.5L13.4717 184.5V288L0 227.25L28.27 107.5L53.8868 13.5Z'),
    m5: zoomMask(87, 364.93, 'M91.0145 38.7945L183 190.068V176.068V223.068H105.54L0 155.178L0.000945556 63.0411V0L91.0145 38.7945Z'),
  },
  13: {
    m6: mask(114.5, 359, 'M12 3L26.5 0V25.5806L24.5 27.5L9.5 13.5L3 41V64L0 50.5L7 16L12 3Z'),
    m5: mask(82.2, 366, 'M2.7998 23H21.0294L37.8002 37V46H21.8002L0 32L0.000195313 13V0L2.7998 23Z'),
  },
} satisfies Record<number | 'zoom', { m6: string; m5: string }>;

const ZOOM_CARS: { red: CarState; teal: CarState } = {
  red: zoomCar(196.86, 414.8, 173.228, 97.44, 131.14),
  teal: zoomCar(245.65, 451.05, 183.754, 103.362, -81.72),
};

export interface Frame {
  id: number;
  cam: number;
  wordmark: number;
  adies: number;
  masks: number;
  cars: number;
  bubbles: number;
  red: CarState;
  teal: CarState;
  m6: string;
  m5: string;
}

interface FrameOverrides
  extends Partial<Pick<Frame, 'cam' | 'wordmark' | 'adies' | 'masks' | 'cars' | 'bubbles'>> {
  red: CarState;
  teal: CarState;
  m6: string;
  m5: string;
}

// Defaults: wordmark visible, masks on, cars on, camera at 1x, no bubbles.
const frame = (id: number, props: FrameOverrides): Frame => ({
  id,
  cam: 0,
  wordmark: 1,
  adies: 1,
  masks: 1,
  cars: 1,
  bubbles: 0,
  ...props,
});

const RAW_FRAMES: Frame[] = [
  // Frame 2 has the wordmark hidden; the masks are white-on-white so they start in frame 3's shape.
  frame(2, { red: car('red', 76, 406, -90), teal: car('teal', 144.5, 372.5, 0), wordmark: 0, ...MASKS[3] }),
  frame(3, { red: car('red', 76, 394, -90), teal: car('teal', 156.53, 374.85, 38), ...MASKS[3] }),
  frame(4, { red: car('red', 76, 386, -90), teal: car('teal', 164.85, 385.83, 78.2), ...MASKS[4] }),
  frame(5, { red: car('red', 76, 364, -90), teal: car('teal', 161.68, 401.56, 118.33), ...MASKS[5] }),
  frame(6, { red: car('red', 78.02, 362, 0), teal: car('teal', 151.12, 411.85, 160.32), ...MASKS[6] }),
  frame(7, { red: car('red', 99, 362, 0), teal: car('teal', 143.59, 411.69, -179.61), ...MASKS[7] }),
  frame(8, { red: car('red', 113.28, 369.6, 62.23), teal: car('teal', 130.7, 407.06, -134.89), ...MASKS[8] }),
  frame(9, { red: car('red', 112.36, 378.43, 122.15), teal: car('teal', 123.2, 393.39, -98.02), ...MASKS[9] }),
  // Frames 10-12: zoomed in on "Ro"; 11 adds the speech bubbles.
  frame(10, { ...ZOOM_CARS, cam: 1, adies: 0, ...MASKS.zoom }),
  frame(11, { ...ZOOM_CARS, cam: 1, adies: 0, bubbles: 1, ...MASKS.zoom }),
  frame(12, { ...ZOOM_CARS, cam: 1, adies: 0, ...MASKS.zoom }),
  frame(13, { red: car('red', 88.15, 382.62, 180), teal: car('teal', 124.23, 383.95, -71.96), ...MASKS[13] }),
  frame(14, { red: car('red', 84, 383, 56.8), teal: car('teal', 124.23, 383.95, -71.96), ...MASKS[13] }),
  // Frame 15 drops the masks, which reveals the finished "R".
  frame(15, { red: car('red', 113.52, 407.97, 7.07), teal: car('teal', 142.52, 374.5, 0), masks: 0, ...MASKS[13] }),
  frame(16, { red: car('red', 113.52, 407.97, 7.07), teal: car('teal', 142.52, 374.5, 0), masks: 0, cars: 0, ...MASKS[13] }),
];

// Figma stores rotation in +-180 degrees. Unwrap it so each car always turns the
// short way and never spins backwards across the +-180 degree seam.
function unwrapRotation(frames: Frame[], key: 'red' | 'teal'): void {
  let prev = frames[0]![key].rot;
  for (const f of frames) {
    const delta = ((((f[key].rot - prev) % 360) + 540) % 360) - 180;
    f[key] = { ...f[key], rot: prev + delta };
    prev = f[key].rot;
  }
}

unwrapRotation(RAW_FRAMES, 'red');
unwrapRotation(RAW_FRAMES, 'teal');

export const FRAMES: Frame[] = RAW_FRAMES;

export const frameById = (id: number): Frame => {
  const found = FRAMES.find((f) => f.id === id);
  if (!found) throw new Error(`intro: no frame with id ${id}`);
  return found;
};

export interface BubbleSpec {
  text: string;
  ellipse: { cx: number; cy: number; rx: number; ry: number; rot: number };
  tail: { cx: number; cy: number; rot: number };
  /** Screen-space point where the bubble pops from - the tip of its tail. */
  origin: string;
}

// Frame 11 speech bubbles. In Figma they sit outside the zoomed group, so these are
// screen-space numbers.
export const BUBBLES: { left: BubbleSpec; right: BubbleSpec } = {
  left: {
    text: 'wassup',
    ellipse: { cx: 108, cy: 454, rx: 46, ry: 28, rot: 0 },
    tail: { cx: 157.715, cy: 446.23, rot: 59.53 },
    origin: '165.8 441.5',
  },
  right: {
    text: 'niHowdy',
    ellipse: { cx: 286.734, cy: 376.258, rx: 46, ry: 28.5, rot: -14.73 },
    tail: { cx: 253.94, cy: 410.33, rot: -153.18 },
    origin: '249.7 418.7',
  },
};
