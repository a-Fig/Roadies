import { corridor, jamById, JAMS, LONER_ZONE, MATCH_CONFIG, type Jam, type LatLng } from '@roadies/shared';

/** A simulated car creeping north along 101. */
export interface Motion {
  km: number;
  /** The car never passes this point (the head of its jam), km. */
  capKm: number;
  /** Peak speed, km/h. Jam cars stop and go; loners cruise. */
  speedKmh: number;
  stopAndGo: boolean;
  phase: number;
}

export type Spot = { kind: 'jam'; jam: Jam } | { kind: 'loner' };

/**
 * Where the n-th demo joiner goes. Rooms hold 4, so the first wave (6 cars)
 * overfills Hospital Curve past capacity and a second room opens early — then
 * 2 more top up that overflow room to a full 4, so no partially-filled room
 * is left open. From there, joiners go to the *other* jams in same-jam groups
 * of 4 (one full room's worth) before moving on to the next jam.
 *
 * That grouping matters because joining is "closest free seat, any distance,"
 * not "closest jam": a lone new joiner would just fall into whatever room
 * happens to still have a free seat, however far away, mixing cars from
 * different jams into one room. Finishing each jam's room before starting the
 * next guarantees every room is full when a new location's first car arrives,
 * so it always opens a genuinely new, local room instead of bleeding into the
 * last one. Lone commuters are only ever scripted between complete groups,
 * once every room is full, so they actually start out alone.
 */
const OPENING_WAVE = 6;
const TOPUP = 2;
/** One full room's worth of joiners at the same jam. */
const group = (id: string): string[] => Array(MATCH_CONFIG.capacity).fill(id) as string[];
const CYCLE: readonly string[] = [
  ...group('san-mateo'),
  ...group('sfo'),
  ...group('palo-alto'),
  ...group('mountain-view'),
  'loner',
  ...group('redwood-city'),
  ...group('san-jose'),
  'loner',
];

export class DemoDirector {
  private joins = 0;

  constructor(private readonly rng: () => number = Math.random) {}

  reset(): void {
    this.joins = 0;
  }

  /** Pick a spot for the next joiner, honoring `?spot=` overrides. */
  nextSpot(forced?: string): Spot {
    const n = this.joins++;
    const id =
      forced ??
      (n < OPENING_WAVE + TOPUP ? 'hospital-curve' : CYCLE[(n - OPENING_WAVE - TOPUP) % CYCLE.length]!);
    if (id === 'loner') return { kind: 'loner' };
    const jam = jamById(id) ?? JAMS.find((j) => j.id === 'hospital-curve')!;
    return { kind: 'jam', jam };
  }

  initialMotion(spot: Spot): Motion {
    if (spot.kind === 'loner') {
      const km = LONER_ZONE.fromKm + this.rng() * (LONER_ZONE.toKm - LONER_ZONE.fromKm);
      return { km, capKm: corridor.lengthMeters / 1000, speedKmh: 50 + this.rng() * 15, stopAndGo: false, phase: 0 };
    }
    const { headKm, lengthKm } = spot.jam;
    const km = headKm - this.rng() * lengthKm;
    return {
      km,
      capKm: Math.max(km, headKm - this.rng() * 0.15),
      speedKmh: 4 + this.rng() * 6,
      stopAndGo: true,
      phase: this.rng() * Math.PI * 2,
    };
  }

  /** Advance a car by `dtMs` at wall time `now`. */
  step(motion: Motion, dtMs: number, now: number): void {
    let speed = motion.speedKmh;
    if (motion.stopAndGo) {
      // Roughly 40-second stop-and-go waves; stopped about half the time.
      speed *= Math.max(0, Math.sin(motion.phase + (now / 40_000) * Math.PI * 2));
    }
    motion.km = Math.min(motion.capKm, motion.km + (speed * dtMs) / 3_600_000);
  }

  position(motion: Motion): { pos: LatLng; heading: number } {
    return corridor.at(motion.km * 1000);
  }
}
