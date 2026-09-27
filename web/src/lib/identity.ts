import { randomCar, type CarProfile, type Mode } from '@roadies/shared';
import { localizeName } from './i18n';

// Storage can be unavailable (private mode, blocked site data); fall back to memory.
const memory = new Map<string, string>();
function read(storage: 'local' | 'session', key: string): string | null {
  try {
    return (storage === 'local' ? localStorage : sessionStorage).getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}
function write(storage: 'local' | 'session', key: string, value: string): void {
  memory.set(key, value);
  try {
    (storage === 'local' ? localStorage : sessionStorage).setItem(key, value);
  } catch {
    // memory only
  }
}

function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * One car per browser tab (sessionStorage), so a reload keeps your seat and
 * several tabs on one laptop act as several cars.
 */
export function clientId(mode: Mode): string {
  const key = `roadies.client.${mode}`;
  let id = read('session', key);
  if (!id) {
    id = `${mode}-${randomId()}`;
    write('session', key, id);
  }
  return id;
}

/**
 * Demo mode: a random car, kept for this tab. Its default name follows the
 * current language ("Teal Civic", "Civic turquoise"), even after a switch.
 */
export function demoCar(): CarProfile {
  const saved = read('session', 'roadies.demoCar');
  if (saved) {
    try {
      return localizeName(JSON.parse(saved) as CarProfile);
    } catch {
      // fall through
    }
  }
  const car = localizeName(randomCar());
  write('session', 'roadies.demoCar', JSON.stringify(car));
  return car;
}

/** Settings in demo mode: the tab's car is edited like a saved profile, but kept for this tab only. */
export function saveDemoCar(profile: CarProfile): void {
  write('session', 'roadies.demoCar', JSON.stringify(profile));
}

/** Normal mode: the profile from the setup screen, kept on this device. */
export function savedProfile(): CarProfile | null {
  const saved = read('local', 'roadies.profile');
  if (!saved) return null;
  try {
    return localizeName(JSON.parse(saved) as CarProfile);
  } catch {
    return null;
  }
}

export function saveProfile(profile: CarProfile): void {
  write('local', 'roadies.profile', JSON.stringify(profile));
}

/**
 * Normal mode must never force the setup screen (owner rule): on a driver's
 * very first open, assign a random car and name, save it like `Setup` would,
 * and go straight to Your jam. Setup is still reachable any time from its
 * icon to change color, make, name or language.
 */
export function ensureProfile(): CarProfile {
  const existing = savedProfile();
  if (existing) return existing;
  const car = localizeName(randomCar());
  saveProfile(car);
  return car;
}
