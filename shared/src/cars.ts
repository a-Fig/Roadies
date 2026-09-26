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

export const CAR_COLORS = [
  { name: 'Teal', hex: '#1abc9c' },
  { name: 'Silver', hex: '#c0c6cf' },
  { name: 'Red', hex: '#f04747' },
  { name: 'Blue', hex: '#4f8cff' },
  { name: 'White', hex: '#f2f3f5' },
  { name: 'Black', hex: '#5c5f66' },
  { name: 'Orange', hex: '#ff8c1a' },
  { name: 'Yellow', hex: '#f5d90a' },
  { name: 'Green', hex: '#3ba55d' },
  { name: 'Purple', hex: '#9b59b6' },
  { name: 'Pink', hex: '#ff73c3' },
  { name: 'Gold', hex: '#d4a017' },
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
