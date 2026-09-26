export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing from a to b, degrees clockwise from north. */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** A polyline you can walk along by distance. */
export class Route {
  readonly points: readonly LatLng[];
  /** cumulative[i] = meters from the start to points[i]. */
  readonly cumulative: readonly number[];

  constructor(lngLat: ReadonlyArray<readonly [number, number]>) {
    if (lngLat.length < 2) throw new Error('Route needs at least two points');
    this.points = lngLat.map(([lng, lat]) => ({ lat, lng }));
    const cumulative = [0];
    for (let i = 1; i < this.points.length; i++) {
      cumulative.push(cumulative[i - 1]! + haversineMeters(this.points[i - 1]!, this.points[i]!));
    }
    this.cumulative = cumulative;
  }

  get lengthMeters(): number {
    return this.cumulative[this.cumulative.length - 1]!;
  }

  /** Position and heading at `meters` from the start (clamped to the route). */
  at(meters: number): { pos: LatLng; heading: number } {
    const m = Math.max(0, Math.min(this.lengthMeters, meters));
    let i = 1;
    while (i < this.cumulative.length - 1 && this.cumulative[i]! < m) i++;
    const a = this.points[i - 1]!;
    const b = this.points[i]!;
    const segLen = this.cumulative[i]! - this.cumulative[i - 1]!;
    const t = segLen === 0 ? 0 : (m - this.cumulative[i - 1]!) / segLen;
    return {
      pos: { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t },
      heading: bearingDeg(a, b),
    };
  }

  /** Meters along the route of the route vertex nearest to `pos`. */
  nearestMeters(pos: LatLng): number {
    let best = 0;
    let bestDist = Infinity;
    this.points.forEach((p, i) => {
      const d = haversineMeters(p, pos);
      if (d < bestDist) {
        bestDist = d;
        best = this.cumulative[i]!;
      }
    });
    return best;
  }
}
