import { US101_NB } from './data/us101';
import { haversineMeters, Route, type LatLng } from './geo';

/** US-101 northbound from Gilroy to San Francisco. */
export const corridor = new Route(US101_NB);

export interface Landmark {
  name: string;
  /** Distance along the corridor, km. */
  km: number;
}

/** Named points along 101 NB (km measured along `corridor`). Used to name rooms. */
export const LANDMARKS: readonly Landmark[] = [
  { name: 'Gilroy', km: 0.5 },
  { name: 'San Martin', km: 8.9 },
  { name: 'Morgan Hill', km: 14.3 },
  { name: 'Coyote Valley', km: 22.0 },
  { name: 'Blossom Hill', km: 34.5 },
  { name: 'Tully Road', km: 42.6 },
  { name: 'San Jose 101/880', km: 50.0 },
  { name: 'Mountain View 101/85', km: 65.5 },
  { name: 'Palo Alto', km: 72.5 },
  { name: 'Menlo Park', km: 78.3 },
  { name: 'Redwood City', km: 81.5 },
  { name: 'San Carlos', km: 84.1 },
  { name: 'San Mateo 101/92', km: 92.9 },
  { name: 'Burlingame', km: 98.8 },
  { name: 'SFO', km: 103.3 },
  { name: 'South San Francisco', km: 109.8 },
  { name: 'Candlestick', km: 115.2 },
  { name: 'Hospital Curve', km: 120.0 },
];

const LANDMARK_POSITIONS = LANDMARKS.map((l) => ({ ...l, pos: corridor.at(l.km * 1000).pos }));

/** How close a room must start to a landmark to be named after it. */
const LANDMARK_NAMING_RADIUS_M = 4000;

/** Name for a room founded at `pos`: nearest landmark, or a generic fallback. */
export function placeName(pos: LatLng): string {
  let best: string | null = null;
  let bestDist = LANDMARK_NAMING_RADIUS_M;
  for (const l of LANDMARK_POSITIONS) {
    const d = haversineMeters(l.pos, pos);
    if (d <= bestDist) {
      bestDist = d;
      best = l.name;
    }
  }
  return best ?? 'Jam';
}

export type JamId =
  | 'san-jose'
  | 'mountain-view'
  | 'palo-alto'
  | 'redwood-city'
  | 'san-mateo'
  | 'sfo'
  | 'hospital-curve';

export interface Jam {
  id: JamId;
  name: string;
  /** Head of the queue (the choke point), km along the corridor. */
  headKm: number;
  /** How far the queue backs up behind the head, km. */
  lengthKm: number;
}

/**
 * Demo jams at real 101 NB morning choke points. Spaced so that no two queues
 * come within 5 km of each other, which keeps them in separate rooms.
 */
export const JAMS: readonly Jam[] = [
  { id: 'san-jose', name: 'San Jose 101/880', headKm: 50.0, lengthKm: 1.2 },
  { id: 'mountain-view', name: 'Mountain View 101/85', headKm: 65.5, lengthKm: 1.2 },
  { id: 'palo-alto', name: 'Palo Alto', headKm: 73.3, lengthKm: 1.0 },
  { id: 'redwood-city', name: 'Redwood City', headKm: 81.5, lengthKm: 1.0 },
  { id: 'san-mateo', name: 'San Mateo 101/92', headKm: 92.9, lengthKm: 1.2 },
  { id: 'sfo', name: 'SFO', headKm: 103.3, lengthKm: 1.2 },
  { id: 'hospital-curve', name: 'Hospital Curve', headKm: 120.0, lengthKm: 1.5 },
];

/** Where lone commuters appear: Gilroy / Morgan Hill, far from every jam. */
export const LONER_ZONE = { fromKm: 1, toKm: 20 } as const;

export function jamById(id: string): Jam | undefined {
  return JAMS.find((j) => j.id === id);
}
