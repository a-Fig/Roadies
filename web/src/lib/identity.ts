import { randomCar, type CarProfile, type Mode } from '@roadies/shared';

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

/** Demo mode: a random car, kept for this tab. */
export function demoCar(): CarProfile {
  const saved = read('session', 'roadies.demoCar');
  if (saved) {
    try {
      return JSON.parse(saved) as CarProfile;
    } catch {
      // fall through
    }
  }
  const car = randomCar();
  write('session', 'roadies.demoCar', JSON.stringify(car));
  return car;
}

/** Normal mode: the profile from the setup screen, kept on this device. */
export function savedProfile(): CarProfile | null {
  const saved = read('local', 'roadies.profile');
  if (!saved) return null;
  try {
    return JSON.parse(saved) as CarProfile;
  } catch {
    return null;
  }
}

export function saveProfile(profile: CarProfile): void {
  write('local', 'roadies.profile', JSON.stringify(profile));
}
