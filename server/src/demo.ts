import { corridor, jamById, JAMS, LONER_ZONE, type Jam, type LatLng } from '@roadies/shared';

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
 * Where the n-th demo joiner goes. The first wave overfills Hospital Curve so
 * a second room opens early; then the smaller jams fill; lone commuters show
 * up now and then so the 15-second merge happens on screen.
 */
const OPENING_WAVE = 11;
const CYCLE: readonly string[] = [
  'san-mateo',
  'sfo',
  'palo-alto',
  'mountain-view',
  'san-mateo',
  'sfo',
  'palo-alto',
  'mountain-view',
  'loner',
  'hospital-curve',
  'redwood-city',
  'san-jose',
  'redwood-city',
  'san-jose',
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
    const id = forced ?? (n < OPENING_WAVE ? 'hospital-curve' : CYCLE[(n - OPENING_WAVE) % CYCLE.length]!);
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
