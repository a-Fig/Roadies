import { describe, expect, it } from 'vitest';
import { corridor, JAMS, LONER_ZONE, placeName } from '../src/corridor';
import { haversineMeters } from '../src/geo';

const queuePoints = (headKm: number, lengthKm: number) =>
  Array.from({ length: 11 }, (_, i) => corridor.at((headKm - (lengthKm * i) / 10) * 1000).pos);

describe('corridor', () => {
  it('runs Gilroy to San Francisco along 101 (~122 km)', () => {
    expect(corridor.lengthMeters / 1000).toBeGreaterThan(115);
    expect(corridor.lengthMeters / 1000).toBeLessThan(130);
    expect(corridor.points[0]!.lat).toBeLessThan(37.1);
    expect(corridor.points.at(-1)!.lat).toBeGreaterThan(37.75);
  });

  it('keeps every pair of jams more than 5.5 km apart, so they read as distinct places on the map', () => {
    for (let i = 0; i < JAMS.length; i++) {
      for (let j = i + 1; j < JAMS.length; j++) {
        const a = queuePoints(JAMS[i]!.headKm, JAMS[i]!.lengthKm);
        const b = queuePoints(JAMS[j]!.headKm, JAMS[j]!.lengthKm);
        const min = Math.min(...a.flatMap((p) => b.map((q) => haversineMeters(p, q))));
        expect(min, `${JAMS[i]!.id} vs ${JAMS[j]!.id}`).toBeGreaterThan(5500);
      }
    }
  });

  it('keeps the loner zone far from every jam', () => {
    const loner = queuePoints(LONER_ZONE.toKm, LONER_ZONE.toKm - LONER_ZONE.fromKm);
    for (const jam of JAMS) {
      const q = queuePoints(jam.headKm, jam.lengthKm);
      const min = Math.min(...loner.flatMap((p) => q.map((x) => haversineMeters(p, x))));
      expect(min, jam.id).toBeGreaterThan(20_000);
    }
  });

  it('names rooms after the jam they start in', () => {
    for (const jam of JAMS) {
      for (const p of queuePoints(jam.headKm, jam.lengthKm)) {
        expect(placeName(p)).toBe(jam.name);
      }
    }
  });

  it('names every lone-commuter spot after a real place', () => {
    for (let km = LONER_ZONE.fromKm; km <= LONER_ZONE.toKm + 5; km += 0.5) {
      expect(placeName(corridor.at(km * 1000).pos), `km ${km}`).not.toBe('Jam');
    }
  });

  it('falls back to a generic name away from landmarks', () => {
    expect(placeName({ lat: 40.7, lng: -74 })).toBe('Jam');
  });

  it('walks the route with a heading that is broadly northbound', () => {
    const { heading } = corridor.at(92_000);
    expect(heading > 270 || heading < 90).toBe(true);
  });
});
