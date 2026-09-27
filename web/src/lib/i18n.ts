import { CAR_COLORS, isLang, LANGS, type CarProfile, type Lang, type NoticeCode } from '@roadies/shared';

/**
 * Phone UI strings in English, French, Spanish and Vietnamese (DESIGN.md §1).
 * Drivers glance, they don't read (owner rule, 2026-09-26): labels are a word
 * or two, never a sentence where a word or an icon works. French uses "tu",
 * Spanish neutral Latin American "tú", Vietnamese "bạn". Spoken command
 * phrases are not here: the UI shows `sayPhrase(lang, cmd)` from shared (also
 * as the button labels), so the screen always matches what the recognizer
 * accepts. The presenter and /sounds stay English.
 */

type ColorName = (typeof CAR_COLORS)[number]['name'];

const en = {
  // Your jam
  /** Demo jam card: eyebrow over the road name. */
  stuckOn: 'Stuck on',
  /** Live jam card: eyebrow over "Your jam". */
  liveEyebrow: 'Proximity voice',
  yourJam: 'Your jam',
  settings: 'Settings',
  driversTalking: (n: number) => `${n} ${n === 1 ? 'driver' : 'drivers'} talking`,
  /** What each command card does, before there's a live match to show. */
  connectDesc: 'Nearest drivers',
  randomDesc: 'Any open room',
  /** Over the command cards while the server is listening for them (after a disconnect). */
  justSay: 'Just say',
  /** The one short safety line. */
  eyesOnRoad: 'Eyes on the road',
  starting: 'Starting…',
  noGps: 'This browser has no GPS access.',
  needLocation: 'Roadies needs your location to find nearby drivers.',
  needMic: 'Roadies needs your microphone. Allow it and tap again.',

  // Voice chat
  quote: (s: string) => `“${s}”`,
  /** Her "Live" tag: voice is connected. */
  live: 'Live',
  voiceConnecting: 'Connecting…',
  voiceFailed: 'Voice connection failed',
  finding: 'Finding your jam…',
  /** Screen-reader label for the room's head count tag. */
  roomCount: (n: number) => `${n} ${n === 1 ? 'roadie' : 'roadies'} in this room`,
  /** Your own tile in the avatar grid. */
  you: 'You',
  mutedBanner: (q: string) => `MUTED · say ${q}`,
  deafenedBanner: (q: string) => `DEAFENED · say ${q}`,
  tapForSound: 'Tap to turn on sound',
  keepOnScreen: 'Keep Roadies on screen',
  ok: 'OK',
  /** The "connect" card's context line while disconnected with no one to match. */
  newRoom: 'New room',
  notices: { 'no-open-rooms': 'No rooms open' } satisfies Record<NoticeCode, string>,

  // Settings
  back: 'Back',
  setupTitle: 'Your car',
  displayName: 'Name',
  color: 'Color',
  car: 'Car',
  language: 'Language',
  save: 'Save',
  /** A car's default display name, from its make and (translated) color. */
  carName: (make: string, color: string) => `${color} ${make}`,
  colors: {
    Teal: 'Teal',
    Silver: 'Silver',
    Red: 'Red',
    Blue: 'Blue',
    White: 'White',
    Black: 'Black',
    Orange: 'Orange',
    Yellow: 'Yellow',
    Green: 'Green',
    Purple: 'Purple',
    Pink: 'Pink',
    Gold: 'Gold',
    Tangerine: 'Tangerine',
    Brick: 'Brick',
  } satisfies Record<ColorName, string>,
};

export type Strings = typeof en;

/** French: 0 and 1 are singular. */
const frOne = (n: number) => n < 2;

const fr: Strings = {
  stuckOn: 'Bouchon sur',
  liveEyebrow: 'Vocal de proximité',
  yourJam: 'Ton bouchon',
  settings: 'Paramètres',
  driversTalking: (n) => (frOne(n) ? `${n} conducteur parle` : `${n} conducteurs parlent`),
  connectDesc: 'Les plus proches',
  randomDesc: 'Un salon au hasard',
  justSay: 'Dis juste',
  eyesOnRoad: 'Les yeux sur la route',
  starting: 'Démarrage…',
  noGps: 'Ce navigateur n’a pas accès au GPS.',
  needLocation: 'Roadies a besoin de ta position pour trouver les conducteurs proches.',
  needMic: 'Roadies a besoin de ton micro. Autorise-le et touche à nouveau.',

  quote: (s) => `« ${s} »`,
  live: 'En direct',
  voiceConnecting: 'Connexion…',
  voiceFailed: 'Échec de la connexion vocale',
  finding: 'Recherche de ton bouchon…',
  roomCount: (n) => `${n} roadies dans ce salon`,
  you: 'Toi',
  mutedBanner: (q) => `MICRO COUPÉ · dis ${q}`,
  deafenedBanner: (q) => `SON COUPÉ · dis ${q}`,
  tapForSound: 'Touche pour activer le son',
  keepOnScreen: 'Garde Roadies à l’écran',
  ok: 'OK',
  newRoom: 'Nouveau salon',
  notices: { 'no-open-rooms': 'Aucun salon ouvert' },

  back: 'Retour',
  setupTitle: 'Ta voiture',
  displayName: 'Pseudo',
  color: 'Couleur',
  car: 'Voiture',
  language: 'Langue',
  save: 'Enregistrer',
  // "une Civic noire": feminine, like "la voiture".
  carName: (make, color) => `${make} ${color}`,
  colors: {
    Teal: 'turquoise',
    Silver: 'argentée',
    Red: 'rouge',
    Blue: 'bleue',
    White: 'blanche',
    Black: 'noire',
    Orange: 'orange',
    Yellow: 'jaune',
    Green: 'verte',
    Purple: 'violette',
    Pink: 'rose',
    Gold: 'dorée',
    Tangerine: 'mandarine',
    Brick: 'brique',
  },
};

const es: Strings = {
  stuckOn: 'Tráfico en',
  liveEyebrow: 'Voz de proximidad',
  yourJam: 'Tu tráfico',
  settings: 'Configuración',
  driversTalking: (n) => `${n} ${n === 1 ? 'conductor' : 'conductores'} hablando`,
  connectDesc: 'Los más cercanos',
  randomDesc: 'Una sala al azar',
  justSay: 'Solo di',
  eyesOnRoad: 'La vista en el camino',
  starting: 'Iniciando…',
  noGps: 'Este navegador no tiene acceso al GPS.',
  needLocation: 'Roadies necesita tu ubicación para encontrar conductores cercanos.',
  needMic: 'Roadies necesita tu micrófono. Permítelo y toca de nuevo.',

  quote: (s) => `“${s}”`,
  live: 'En vivo',
  voiceConnecting: 'Conectando…',
  voiceFailed: 'No se pudo conectar la voz',
  finding: 'Buscando tu tráfico…',
  roomCount: (n) => `${n} roadies en esta sala`,
  you: 'Tú',
  mutedBanner: (q) => `SILENCIADO · di ${q}`,
  deafenedBanner: (q) => `SIN SONIDO · di ${q}`,
  tapForSound: 'Toca para activar el sonido',
  keepOnScreen: 'Mantén Roadies en pantalla',
  ok: 'OK',
  newRoom: 'Sala nueva',
  notices: { 'no-open-rooms': 'Sin salas abiertas' },

  back: 'Volver',
  setupTitle: 'Tu auto',
  displayName: 'Nombre',
  color: 'Color',
  car: 'Auto',
  language: 'Idioma',
  save: 'Guardar',
  // "un Civic negro": masculine, like "el auto".
  carName: (make, color) => `${make} ${color}`,
  colors: {
    Teal: 'turquesa',
    Silver: 'plateado',
    Red: 'rojo',
    Blue: 'azul',
    White: 'blanco',
    Black: 'negro',
    Orange: 'naranja',
    Yellow: 'amarillo',
    Green: 'verde',
    Purple: 'morado',
    Pink: 'rosa',
    Gold: 'dorado',
    Tangerine: 'mandarina',
    Brick: 'ladrillo',
  },
};

const vi: Strings = {
  stuckOn: 'Kẹt xe trên',
  liveEyebrow: 'Thoại lân cận',
  yourJam: 'Đoạn kẹt xe',
  settings: 'Cài đặt',
  // Vietnamese nouns do not inflect for number.
  driversTalking: (n) => `${n} tài xế đang nói`,
  connectDesc: 'Tài xế gần nhất',
  randomDesc: 'Phòng ngẫu nhiên',
  justSay: 'Chỉ cần nói',
  eyesOnRoad: 'Mắt luôn nhìn đường',
  starting: 'Đang khởi động…',
  noGps: 'Trình duyệt này không truy cập được GPS.',
  needLocation: 'Roadies cần vị trí của bạn để tìm tài xế ở gần.',
  needMic: 'Roadies cần micro của bạn. Hãy cho phép rồi chạm lại.',

  quote: (s) => `“${s}”`,
  live: 'Trực tiếp',
  voiceConnecting: 'Đang kết nối…',
  voiceFailed: 'Không kết nối được thoại',
  finding: 'Đang tìm đoạn kẹt xe…',
  roomCount: (n) => `Phòng có ${n} người`,
  you: 'Bạn',
  mutedBanner: (q) => `ĐÃ TẮT MIC · nói ${q}`,
  deafenedBanner: (q) => `ĐÃ TẮT LOA · nói ${q}`,
  tapForSound: 'Chạm để bật âm thanh',
  keepOnScreen: 'Giữ Roadies trên màn hình',
  ok: 'OK',
  newRoom: 'Phòng mới',
  notices: { 'no-open-rooms': 'Không có phòng nào' },

  back: 'Quay lại',
  setupTitle: 'Xe của bạn',
  displayName: 'Tên',
  color: 'Màu',
  car: 'Xe',
  language: 'Ngôn ngữ',
  save: 'Lưu',
  carName: (make, color) => `${make} ${color}`,
  colors: {
    Teal: 'xanh ngọc',
    Silver: 'bạc',
    Red: 'đỏ',
    Blue: 'xanh dương',
    White: 'trắng',
    Black: 'đen',
    Orange: 'cam',
    Yellow: 'vàng',
    Green: 'xanh lá',
    Purple: 'tím',
    Pink: 'hồng',
    Gold: 'vàng kim',
    Tangerine: 'quýt',
    Brick: 'đỏ gạch',
  },
};

const STRINGS: Record<Lang, Strings> = { en, fr, es, vi };

const KEY = 'roadies.lang';

/** The UI and voice-command language: the one chosen in settings, else the phone's, else English. */
export function lang(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (isLang(saved)) return saved;
  } catch {
    // Storage blocked: fall back to the phone's language.
  }
  // The first of the phone's preferred languages that Roadies speaks.
  for (const tag of navigator.languages) {
    const base = tag.toLowerCase().split('-')[0];
    if (isLang(base)) return base;
  }
  return 'en';
}

export function setLang(l: Lang): void {
  try {
    localStorage.setItem(KEY, l);
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
}

export const strings = (l: Lang = lang()): Strings => STRINGS[l];

/** A spoken phrase as a label or heading: first letter capitalized ("connect" -> "Connect", "bật mic" -> "Bật mic"). */
export const capitalize = (l: Lang, s: string): string => s.charAt(0).toLocaleUpperCase(l) + s.slice(1);

/** A color's name in `l`, lowercase except in English ("noire", "Black"). Unknown colors pass through. */
export const colorName = (l: Lang, color: string): string => STRINGS[l].colors[color as ColorName] ?? color;

/** A color swatch's label ("Noire"). */
export const colorLabel = (l: Lang, color: string): string => capitalize(l, colorName(l, color));

/** "Teal Civic", "Civic turquoise", "Civic turquesa", "Civic xanh ngọc". */
export const defaultName = (l: Lang, make: string, color: string): string =>
  STRINGS[l].carName(make, colorName(l, color));

/** Whether the driver kept the default name, in any language. */
export const hasDefaultName = (p: CarProfile): boolean =>
  LANGS.some((l) => p.name === defaultName(l, p.make, p.color));

/** A profile whose default name follows the current language; a name the driver typed stays. */
export const localizeName = (p: CarProfile, l: Lang = lang()): CarProfile =>
  hasDefaultName(p) ? { ...p, name: defaultName(l, p.make, p.color) } : p;
