import { corridor, JAMS, type CarSnapshot, type LatLng } from '@roadies/shared';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';

interface Props {
  cars: CarSnapshot[];
  roomColor: (roomId: string | null) => string;
  onCarClick?: (car: CarSnapshot) => void;
  /** Bumped to re-fit the whole corridor. */
  fitSignal: number;
  focus: LatLng[] | null;
}

const toLL = (p: LatLng): L.LatLngTuple => [p.lat, p.lng];

/** Deterministic pseudo-random so background traffic is stable across reloads. */
function seeded(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

function backgroundTraffic(): L.LatLngTuple[] {
  const rng = seeded(42);
  const dots: L.LatLngTuple[] = [];
  const jitter = (p: LatLng): L.LatLngTuple => [p.lat + (rng() - 0.5) * 0.0012, p.lng + (rng() - 0.5) * 0.0012];
  for (const jam of JAMS) {
    // Dense queue plus a longer, thinner tail behind it.
    for (let i = 0; i < 45; i++) dots.push(jitter(corridor.at((jam.headKm - rng() * jam.lengthKm) * 1000).pos));
    for (let i = 0; i < 20; i++) dots.push(jitter(corridor.at((jam.headKm - jam.lengthKm - rng() * 3) * 1000).pos));
  }
  const km = corridor.lengthMeters / 1000;
  for (let i = 0; i < km / 0.9; i++) dots.push(jitter(corridor.at(rng() * km * 1000).pos));
  return dots;
}

function queueLine(headKm: number, lengthKm: number): L.LatLngTuple[] {
  const pts: L.LatLngTuple[] = [];
  for (let km = headKm - lengthKm - 0.6; km <= headKm; km += 0.1) pts.push(toLL(corridor.at(km * 1000).pos));
  return pts;
}

function carHtml(car: CarSnapshot, color: string): string {
  const classes = ['car-dot'];
  if (car.speaking) classes.push('speaking');
  if (!car.state.connected) classes.push('ghost');
  else if (car.state.selfMute || car.state.selfDeaf) classes.push('muted');
  if (car.bot) classes.push('bot');
  return `<div class="${classes.join(' ')}" style="--c:${color}"><span></span></div>`;
}

export function CorridorMap({ cars, roomColor, onCarClick, fitSignal, focus }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef(new Map<string, { marker: L.Marker; html: string }>());
  const clickRef = useRef(onCarClick);
  clickRef.current = onCarClick;

  useEffect(() => {
    const m = L.map(host.current!, { zoomControl: false, attributionControl: true, preferCanvas: true });
    // Esri's dark canvas needs no API key (CARTO's dark tiles now do).
    const esri = 'https://services.arcgisonline.com/arcgis/rest/services/Canvas';
    L.tileLayer(`${esri}/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, {
      maxZoom: 16,
      attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors',
    }).addTo(m);
    L.tileLayer(`${esri}/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 16, opacity: 0.8 }).addTo(m);
    const line = corridor.points.map(toLL);
    L.polyline(line, { color: '#f5a524', weight: 10, opacity: 0.12 }).addTo(m);
    L.polyline(line, { color: '#f5a524', weight: 2.5, opacity: 0.55 }).addTo(m);
    for (const jam of JAMS) {
      L.polyline(queueLine(jam.headKm, jam.lengthKm), { color: '#f23f43', weight: 6, opacity: 0.8 }).addTo(m);
    }
    for (const p of backgroundTraffic()) {
      L.circleMarker(p, { radius: 2.2, stroke: false, fillColor: '#8a8e99', fillOpacity: 0.55, interactive: false }).addTo(m);
    }
    L.control.zoom({ position: 'topright' }).addTo(m);
    m.fitBounds(L.latLngBounds(line), { padding: [30, 30] });
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      markers.current.clear();
    };
  }, []);

  useEffect(() => {
    if (fitSignal && map.current) map.current.fitBounds(L.latLngBounds(corridor.points.map(toLL)), { padding: [30, 30] });
  }, [fitSignal]);

  useEffect(() => {
    if (!focus?.length || !map.current) return;
    map.current.flyToBounds(L.latLngBounds(focus.map(toLL)).pad(0.6), { maxZoom: 15, duration: 1.2 });
  }, [focus]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const seen = new Set<string>();
    for (const car of cars) {
      seen.add(car.id);
      const html = carHtml(car, roomColor(car.roomId));
      const existing = markers.current.get(car.id);
      if (!existing) {
        const marker = L.marker(toLL(car.pos), {
          icon: L.divIcon({ html, className: 'car-icon', iconSize: [22, 22] }),
          zIndexOffset: 1000,
        })
          // A text node, not a string: Leaflet renders tooltip strings as HTML,
          // and car.name is a driver-chosen string.
          .bindTooltip(Object.assign(document.createElement('span'), { textContent: car.name }), {
            direction: 'top',
            offset: [0, -10],
            className: 'car-tip',
          })
          .on('click', () => clickRef.current?.(car))
          .addTo(m);
        markers.current.set(car.id, { marker, html });
      } else {
        existing.marker.setLatLng(toLL(car.pos));
        if (existing.html !== html) {
          existing.marker.setIcon(L.divIcon({ html, className: 'car-icon', iconSize: [22, 22] }));
          existing.html = html;
        }
        existing.marker.off('click').on('click', () => clickRef.current?.(car));
      }
      const marker = markers.current.get(car.id)!.marker;
      if (car.speaking) marker.openTooltip();
      else marker.closeTooltip();
    }
    for (const [id, { marker }] of markers.current) {
      if (!seen.has(id)) {
        marker.remove();
        markers.current.delete(id);
      }
    }
  }, [cars, roomColor]);

  return <div ref={host} className="map" />;
}
