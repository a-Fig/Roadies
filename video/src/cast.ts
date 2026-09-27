import { colorHex } from '@roadies/shared';

/** The reel's drivers. Names are ones `randomCar()` can produce, so the app shows them as-is. */
export type CastId = 'hero' | 'prius' | 'tacoma' | 'miata' | 'wrangler' | 'mustang';

export interface CastMember {
  id: CastId;
  /** What the app shows: "<Color> <Make>". */
  name: string;
  make: string;
  color: string;
  hex: string;
}

const member = (id: CastId, color: string, make: string): CastMember => ({
  id,
  name: `${color} ${make}`,
  make,
  color,
  hex: colorHex(color),
});

export const CAST: Record<CastId, CastMember> = {
  hero: member('hero', 'Teal', 'Civic'),
  prius: member('prius', 'Silver', 'Prius'),
  tacoma: member('tacoma', 'Red', 'Tacoma'),
  miata: member('miata', 'Pink', 'Miata'),
  wrangler: member('wrangler', 'Yellow', 'Wrangler'),
  mustang: member('mustang', 'Gold', 'Mustang'),
};

/** The brand kit's palette (web/src/brand.css, light values). */
export const BRAND = {
  orange: '#f4682c',
  teal: '#137584',
  cream: '#fffcee',
  ink: '#2a1f1f',
  bubble: '#b7e8f0',
  brakeRed: '#f04747',
  goGreen: '#3ba55d',
} as const;
