export const CAR_MAKES = [
  'Civic',
  'Corolla',
  'Prius',
  'Camry',
  'Accord',
  'Model 3',
  'Model Y',
  'RAV4',
  'CR-V',
  'Outback',
  'F-150',
  'Tacoma',
  'Wrangler',
  'Mustang',
  'Miata',
  'Leaf',
  'Bolt',
  'Mini',
  'Rivian',
  'Jetta',
] as const;

// Hexes are tuned (WCAG relative-luminance contrast, not just eyeballed) so every
// color still reads as a CarArt body fill on both the brand-kit backgrounds: cream
// (#FFFCEE) and dark ink (#2A1F1F, see web/src/brand.css). A few of the original
// Discord-style swatches were nearly invisible on one of the two (White/Silver/Yellow
// wash out on cream; Black/Purple/Brick washed out on ink) and were nudged in
// lightness only, keeping their hue and name. Tangerine and Brick are the girlfriend's
// design's orange (#F4682C, brand.css --brand-orange) and her red car's body color
// (originally #960013, lightened for legibility on the dark background) — "make more
// colors" was the owner's ask.
export const CAR_COLORS = [
  { name: 'Teal', hex: '#1abc9c' },
  { name: 'Silver', hex: '#96a0ab' },
  { name: 'Red', hex: '#f04747' },
  { name: 'Blue', hex: '#4f8cff' },
  { name: 'White', hex: '#c2cbd6' },
  { name: 'Black', hex: '#6e7078' },
  { name: 'Orange', hex: '#ff8c1a' },
  { name: 'Yellow', hex: '#b8a600' },
  { name: 'Green', hex: '#3ba55d' },
  { name: 'Purple', hex: '#a868c2' },
  { name: 'Pink', hex: '#ff73c3' },
  { name: 'Gold', hex: '#d4a017' },
  { name: 'Tangerine', hex: '#f4682c' },
  { name: 'Brick', hex: '#b94430' },
] as const;

export interface CarProfile {
  /** Display name, e.g. "Teal Civic" or a name the driver typed. */
  name: string;
  make: string;
  /** Color name, e.g. "Teal". */
  color: string;
}

export function colorHex(colorName: string): string {
  return CAR_COLORS.find((c) => c.name === colorName)?.hex ?? '#c0c6cf';
}

const pick = <T>(items: readonly T[], rng: () => number): T =>
  items[Math.floor(rng() * items.length)]!;

export function randomCar(rng: () => number = Math.random): CarProfile {
  const make = pick(CAR_MAKES, rng);
  const color = pick(CAR_COLORS, rng).name;
  return { name: `${color} ${make}`, make, color };
}
