import { CAR_COLORS, isLang, LANGS, type CarProfile, type Lang } from '@roadies/shared';

/**
 * Phone UI strings in English, French, Spanish and Vietnamese (DESIGN.md §1).
 * Copy is short because it is read at a glance while driving: French uses
 * "tu", Spanish neutral Latin American "tú", Vietnamese "bạn". Spoken command
 * phrases are not here: the UI shows `sayPhrase(lang, cmd)` from shared, so
 * the screen always matches what the recognizer accepts. The presenter and
 * /sounds stay English.
 */

type ColorName = (typeof CAR_COLORS)[number]['name'];

const en = {
  // Home and demo pages
  demoKicker: 'Stuck on US-101 northbound · 8:15 AM',
  demoCta: 'Join the jam',
  liveKicker: 'Proximity voice for the jam you’re in',
  liveCta: 'Start driving',
  settings: 'Settings',
  tryDemo: 'Try the demo',
  nobodyTalking: 'No one’s talking yet. Be the first.',
  driversTalking: (n: number) => `${n} ${n === 1 ? 'driver' : 'drivers'} talking`,
  youAre: (name: string) => `You’re the ${name}`,
  tagline: 'Voice chat with the drivers stuck around you',
  starting: 'Starting…',
  handsFree: 'Hands-free: say',
  or: 'or',
  privacy: 'Roadies listens for those words on its server; nothing is recorded.',
  noGps: 'This browser has no GPS access.',
  needLocation: 'Roadies needs your location to find nearby drivers.',
  needMic: 'Roadies needs your microphone. Allow it and tap again.',

  // Driving screen
  quote: (s: string) => `“${s}”`,
  voiceConnected: 'Voice Connected',
  voiceDisconnected: 'Voice Disconnected',
  voiceConnecting: 'Connecting voice…',
  voiceFailed: 'Voice connection failed',
  disconnected: 'Disconnected',
  listeningFor: (q: string) => `Listening for ${q}`,
  finding: 'Finding your jam…',
  matching: 'Matching you with nearby drivers',
  connecting: 'Connecting to Roadies',
  justYou: 'Just you so far — we’ll find you company',
  roomCount: (n: number) => `${n} roadies in this room`,
  sayToRejoin: (q: string) => `Say ${q} to rejoin`,
  talking: (names: string[]) => `${names.join(', ')} ${names.length > 1 ? 'are' : 'is'} talking`,
  onAir: 'You’re on the air',
  cantHear: 'You can’t hear the room',
  quiet: 'Quiet road',
  heard: (q: string) => `✓ Heard ${q}`,
  presenterUsed: (q: string) => `The presenter used ${q}`,
  say: 'Say:',
  mutedBanner: (q: string) => `MUTED · say ${q}`,
  deafenedBanner: (q: string) => `DEAFENED · say ${q}`,
  tapForSound: 'Tap to turn on sound',
  keepOnScreen: 'Keep Roadies on screen — phones pause voice when the browser is in the background.',
  ok: 'OK',
  mute: 'Mute',
  unmute: 'Unmute',
  deafen: 'Deafen',
  undeafen: 'Undeafen',
  disconnect: 'Disconnect',
  connect: 'Connect',

  // Settings
  setupTitle: 'Set up your car',
  setupSub: 'This is how other roadies see you.',
  displayName: 'Display name',
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
  } satisfies Record<ColorName, string>,
};

export type Strings = typeof en;

/** French: 0 and 1 are singular. */
const frOne = (n: number) => n < 2;

const fr: Strings = {
  demoKicker: 'Bouchon sur la US-101 direction nord · 8\u00a0h\u00a015',
  demoCta: 'Rejoindre le bouchon',
  liveKicker: 'Le vocal de proximité pour ton bouchon',
  liveCta: 'Prendre la route',
  settings: 'Paramètres',
  tryDemo: 'Essayer la démo',
  nobodyTalking: 'Personne ne parle encore. Lance-toi\u00a0!',
  driversTalking: (n) => (frOne(n) ? `${n} conducteur parle` : `${n} conducteurs parlent`),
  youAre: (name) => `Tu es ${name}`,
  tagline: 'Parle avec les conducteurs coincés autour de toi',
  starting: 'Démarrage…',
  handsFree: 'Mains libres\u00a0: dis',
  or: 'ou',
  privacy: 'Roadies écoute ces mots sur son serveur\u00a0; rien n’est enregistré.',
  noGps: 'Ce navigateur n’a pas accès au GPS.',
  needLocation: 'Roadies a besoin de ta position pour trouver les conducteurs proches.',
  needMic: 'Roadies a besoin de ton micro. Autorise-le et touche à nouveau.',

  quote: (s) => `« ${s} »`,
  voiceConnected: 'Vocal connecté',
  voiceDisconnected: 'Vocal déconnecté',
  voiceConnecting: 'Connexion au vocal…',
  voiceFailed: 'Échec de la connexion vocale',
  disconnected: 'Déconnecté',
  listeningFor: (q) => `En attente de ${q}`,
  finding: 'Recherche de ton bouchon…',
  matching: 'On cherche des conducteurs près de toi',
  connecting: 'Connexion à Roadies',
  justYou: 'Personne d’autre pour l’instant — on te trouve de la compagnie',
  roomCount: (n) => `${n} roadies dans ce salon`,
  sayToRejoin: (q) => `Dis ${q} pour revenir`,
  talking: (names) => `${names.join(', ')} ${names.length > 1 ? 'parlent' : 'parle'}`,
  onAir: 'Tu es à l’antenne',
  cantHear: 'Tu n’entends plus le salon',
  quiet: 'Tout est calme',
  heard: (q) => `✓ Compris\u00a0: ${q}`,
  presenterUsed: (q) => `Action du présentateur\u00a0: ${q}`,
  say: 'Dis\u00a0:',
  mutedBanner: (q) => `MICRO COUPÉ · dis ${q}`,
  deafenedBanner: (q) => `SON COUPÉ · dis ${q}`,
  tapForSound: 'Touche pour activer le son',
  keepOnScreen: 'Garde Roadies à l’écran — le téléphone coupe la voix quand le navigateur passe en arrière-plan.',
  ok: 'OK',
  mute: 'Couper le micro',
  unmute: 'Activer le micro',
  deafen: 'Couper le son',
  undeafen: 'Remettre le son',
  disconnect: 'Déconnexion',
  connect: 'Connexion',

  setupTitle: 'Configure ta voiture',
  setupSub: 'C’est comme ça que les autres roadies te voient.',
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
  },
};

const es: Strings = {
  demoKicker: 'Tráfico en la US-101 rumbo al norte · 8:15\u00a0a.\u00a0m.',
  demoCta: 'Únete al tráfico',
  liveKicker: 'Chat de voz para el tráfico en el que estás',
  liveCta: 'Empezar a manejar',
  settings: 'Configuración',
  tryDemo: 'Probar la demo',
  nobodyTalking: 'Nadie está hablando todavía. ¡Empieza tú!',
  driversTalking: (n) => `${n} ${n === 1 ? 'conductor' : 'conductores'} hablando`,
  youAre: (name) => `Eres ${name}`,
  tagline: 'Habla con los conductores atascados a tu alrededor',
  starting: 'Iniciando…',
  handsFree: 'Manos libres: di',
  or: 'o',
  privacy: 'Roadies escucha esas palabras en su servidor; no se graba nada.',
  noGps: 'Este navegador no tiene acceso al GPS.',
  needLocation: 'Roadies necesita tu ubicación para encontrar conductores cercanos.',
  needMic: 'Roadies necesita tu micrófono. Permítelo y toca de nuevo.',

  quote: (s) => `“${s}”`,
  voiceConnected: 'Voz conectada',
  voiceDisconnected: 'Voz desconectada',
  voiceConnecting: 'Conectando la voz…',
  voiceFailed: 'No se pudo conectar la voz',
  disconnected: 'Desconectado',
  listeningFor: (q) => `Esperando ${q}`,
  finding: 'Buscando tu tráfico…',
  matching: 'Buscando conductores cerca de ti',
  connecting: 'Conectando con Roadies',
  justYou: 'Por ahora solo estás tú; pronto llegará alguien',
  roomCount: (n) => `${n} roadies en esta sala`,
  sayToRejoin: (q) => `Di ${q} para volver`,
  talking: (names) => `${names.join(', ')} ${names.length > 1 ? 'están' : 'está'} hablando`,
  onAir: 'Estás al aire',
  cantHear: 'No escuchas la sala',
  quiet: 'Todo tranquilo',
  heard: (q) => `✓ Entendido: ${q}`,
  presenterUsed: (q) => `El presentador usó ${q}`,
  say: 'Di:',
  mutedBanner: (q) => `SILENCIADO · di ${q}`,
  deafenedBanner: (q) => `SIN SONIDO · di ${q}`,
  tapForSound: 'Toca para activar el sonido',
  keepOnScreen: 'Mantén Roadies en pantalla: el teléfono pausa la voz cuando el navegador queda en segundo plano.',
  ok: 'OK',
  mute: 'Silenciar',
  unmute: 'Activar micro',
  deafen: 'Apagar sonido',
  undeafen: 'Activar sonido',
  disconnect: 'Desconectar',
  connect: 'Conectar',

  setupTitle: 'Configura tu auto',
  setupSub: 'Así te ven los demás roadies.',
  displayName: 'Nombre visible',
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
  },
};

const vi: Strings = {
  demoKicker: 'Kẹt xe trên US-101 hướng bắc · 8:15 sáng',
  demoCta: 'Tham gia ngay',
  liveKicker: 'Trò chuyện thoại với những người kẹt xe cùng bạn',
  liveCta: 'Bắt đầu lái xe',
  settings: 'Cài đặt',
  tryDemo: 'Dùng thử bản demo',
  nobodyTalking: 'Chưa có ai nói chuyện. Hãy là người đầu tiên!',
  // Vietnamese nouns do not inflect for number.
  driversTalking: (n) => `${n} tài xế đang nói chuyện`,
  youAre: (name) => `Bạn là ${name}`,
  tagline: 'Nói chuyện với các tài xế đang kẹt xe quanh bạn',
  starting: 'Đang khởi động…',
  handsFree: 'Rảnh tay: hãy nói',
  or: 'hoặc',
  privacy: 'Roadies nghe những câu này trên máy chủ; không có gì được ghi âm.',
  noGps: 'Trình duyệt này không truy cập được GPS.',
  needLocation: 'Roadies cần vị trí của bạn để tìm tài xế ở gần.',
  needMic: 'Roadies cần micro của bạn. Hãy cho phép rồi chạm lại.',

  quote: (s) => `“${s}”`,
  voiceConnected: 'Đã kết nối thoại',
  voiceDisconnected: 'Đã ngắt thoại',
  voiceConnecting: 'Đang kết nối thoại…',
  voiceFailed: 'Không kết nối được thoại',
  disconnected: 'Đã ngắt kết nối',
  listeningFor: (q) => `Đang chờ lệnh ${q}`,
  finding: 'Đang tìm đoạn kẹt xe của bạn…',
  matching: 'Đang ghép bạn với tài xế gần đó',
  connecting: 'Đang kết nối Roadies',
  justYou: 'Hiện chỉ có bạn — sẽ sớm có người vào',
  roomCount: (n) => `Phòng có ${n} người`,
  sayToRejoin: (q) => `Nói ${q} để vào lại`,
  talking: (names) => `${names.join(', ')} đang nói`,
  onAir: 'Mọi người đang nghe bạn',
  cantHear: 'Bạn không nghe được phòng',
  quiet: 'Yên ắng',
  heard: (q) => `✓ Đã nghe ${q}`,
  presenterUsed: (q) => `Người thuyết trình đã dùng ${q}`,
  say: 'Nói:',
  mutedBanner: (q) => `ĐÃ TẮT MIC · nói ${q}`,
  deafenedBanner: (q) => `ĐÃ TẮT LOA · nói ${q}`,
  tapForSound: 'Chạm để bật âm thanh',
  keepOnScreen: 'Hãy giữ Roadies trên màn hình — điện thoại tạm dừng thoại khi trình duyệt chạy nền.',
  ok: 'OK',
  mute: 'Tắt mic',
  unmute: 'Bật mic',
  deafen: 'Tắt loa',
  undeafen: 'Bật loa',
  disconnect: 'Ngắt kết nối',
  connect: 'Kết nối',

  setupTitle: 'Thiết lập xe của bạn',
  setupSub: 'Các roadie khác sẽ thấy bạn như thế này.',
  displayName: 'Tên hiển thị',
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

/** A color's name in `l`, lowercase except in English ("noire", "Black"). Unknown colors pass through. */
export const colorName = (l: Lang, color: string): string => STRINGS[l].colors[color as ColorName] ?? color;

/** A color swatch's label ("Noire"). */
export const colorLabel = (l: Lang, color: string): string => {
  const name = colorName(l, color);
  return name.charAt(0).toLocaleUpperCase(l) + name.slice(1);
};

/** "Teal Civic", "Civic turquoise", "Civic turquesa", "Civic xanh ngọc". */
export const defaultName = (l: Lang, make: string, color: string): string =>
  STRINGS[l].carName(make, colorName(l, color));

/** Whether the driver kept the default name, in any language. */
export const hasDefaultName = (p: CarProfile): boolean =>
  LANGS.some((l) => p.name === defaultName(l, p.make, p.color));

/** A profile whose default name follows the current language; a name the driver typed stays. */
export const localizeName = (p: CarProfile, l: Lang = lang()): CarProfile =>
  hasDefaultName(p) ? { ...p, name: defaultName(l, p.make, p.color) } : p;
