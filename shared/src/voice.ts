import { LANGS, type Lang } from './lang';
import type { Mode } from './protocol';

export const COMMANDS = ['mute', 'unmute', 'deafen', 'undeafen', 'disconnect', 'connect'] as const;
export type Command = (typeof COMMANDS)[number];

export interface VoiceState {
  selfMute: boolean;
  selfDeaf: boolean;
  connected: boolean;
}

/** Live: connected, unmuted, undeafened. */
export const INITIAL_VOICE_STATE: VoiceState = { selfMute: false, selfDeaf: false, connected: true };

/**
 * Where a new driver starts (DESIGN.md §1). Normal mode joins live, like
 * Discord. Demo mode joins muted: judges' phones share one table, so open mics
 * would feed back, and saying "unmute" becomes the first thing a judge does.
 */
export const joinState = (mode: Mode): VoiceState =>
  mode === 'demo' ? { ...INITIAL_VOICE_STATE, selfMute: true } : { ...INITIAL_VOICE_STATE };

/** Discord semantics (DESIGN.md §4). */
export function applyCommand(state: VoiceState, command: Command): VoiceState {
  switch (command) {
    case 'mute':
      return { ...state, selfMute: true };
    case 'unmute':
      // Unmuting while deafened also undeafens, as in Discord.
      return { ...state, selfMute: false, selfDeaf: false };
    case 'deafen':
      return { ...state, selfDeaf: true };
    case 'undeafen':
      return { ...state, selfDeaf: false };
    case 'disconnect':
      return { ...state, connected: false };
    case 'connect':
      return { ...state, connected: true };
  }
}

/** Others can hear you. */
export const isTransmitting = (s: VoiceState) => s.connected && !s.selfMute && !s.selfDeaf;

/** You can hear others. */
export const isHearing = (s: VoiceState) => s.connected && !s.selfDeaf;

/**
 * Phrases accepted as each command, per language. The whole utterance must be
 * one of these; "don't mute me" is conversation, not a command. The first
 * phrase is the one the UI tells people to say. Every language also accepts
 * the English phrases ("mute" is Discord-universal). Written with their
 * accents because they double as the recognizer's phrase hints; parsing folds
 * accents away. Extra entries cover common speech-to-text splits of the same
 * word. Adding a command is one line per language.
 */
export const PHRASES: Record<Lang, Record<Command, readonly string[]>> = {
  en: {
    mute: ['mute', 'mute mic', 'mute me'],
    unmute: ['unmute', 'un mute', 'unmute me', 'on mute'],
    deafen: ['deafen', 'deafen me', 'deafin', 'def in'],
    undeafen: ['undeafen', 'un deafen', 'undeafen me', 'on deafen'],
    disconnect: ['disconnect', 'dis connect', 'disconnect me'],
    connect: ['connect', 'reconnect', 'connect me'],
  },
  fr: {
    mute: ['coupe le micro', 'couper le micro', 'micro coupé', 'muet'],
    unmute: ['active le micro', 'activer le micro', 'réactive le micro', 'réactiver le micro', 'rallume le micro', 'remets le micro'],
    deafen: ['coupe le son', 'couper le son', 'sourdine', 'mets la sourdine', 'mettre en sourdine'],
    undeafen: ['remets le son', 'remettre le son', 'active le son', 'rallume le son', 'enlève la sourdine'],
    disconnect: ['déconnexion', 'déconnecte-moi', 'déconnecter'],
    connect: ['connexion', 'connecte-moi', 'connecter', 'reconnecter', 'reconnexion'],
  },
  es: {
    mute: ['apaga el micro', 'apaga el micrófono', 'silencio', 'silenciar', 'silénciame', 'mutear'],
    unmute: ['prende el micro', 'enciende el micro', 'activa el micro', 'prende el micrófono', 'desmutear'],
    deafen: ['apaga el sonido', 'ensordecer', 'ensordéceme'],
    undeafen: ['prende el sonido', 'enciende el sonido', 'activa el sonido', 'dejar de ensordecer'],
    disconnect: ['desconectar', 'desconéctame'],
    connect: ['conectar', 'conéctame', 'reconectar'],
  },
  vi: {
    mute: ['tắt mic', 'tắt micro', 'tắt tiếng'],
    unmute: ['bật mic', 'bật micro', 'bật tiếng', 'mở mic'],
    deafen: ['tắt loa', 'tắt âm thanh'],
    undeafen: ['bật loa', 'bật âm thanh', 'mở loa'],
    disconnect: ['ngắt kết nối', 'thoát'],
    connect: ['kết nối', 'kết nối lại', 'vào lại'],
  },
};

/**
 * Mishearings from real-voice and TTS testing, per recognizer language:
 * accepted as the command, but not sent as recognizer hints (boosting them
 * would only make them likelier). Each one means saying just that triggers
 * the command, so add only short, consistent mishearings nobody would say in
 * conversation. A language's table applies only to its own recognizer: an
 * en-US mishearing says nothing about what fr-FR hears.
 */
export const MISHEARINGS: Record<Lang, Partial<Record<Command, readonly string[]>>> = {
  en: {
    // 2026-09-26: "deafen" came back as "Stephan" / "Stefan" in two real-voice
    // sessions (best guess once, n-best once) and in the TTS n-best lists.
    deafen: ['stephan', 'stefan'],
  },
  fr: {},
  es: {},
  vi: {},
};

/** Normalized phrase -> command, per language: its phrases and mishearings, plus the English phrases. */
const LOOKUP = {} as Record<Lang, ReadonlyMap<string, Command>>;
for (const lang of LANGS) {
  const map = new Map<string, Command>();
  for (const table of [PHRASES.en, PHRASES[lang], MISHEARINGS[lang]]) {
    for (const [cmd, phrases] of Object.entries(table)) {
      for (const p of phrases) map.set(normalizeUtterance(p), cmd as Command);
    }
  }
  LOOKUP[lang] = map;
}

/** Phrase hints for the recognizer: the language's phrases as written, plus the English ones. */
export function commandPhrases(lang: Lang): string[] {
  const all = (l: Lang) => Object.values(PHRASES[l]).flat();
  return [...new Set([...all(lang), ...all('en')])];
}

/** The phrase the UI tells people to say for a command. */
export const sayPhrase = (lang: Lang, cmd: Command): string => PHRASES[lang][cmd][0]!;

/**
 * Lowercase ASCII words: accents folded ("Coupé" -> "coupe", "đ" -> "d"),
 * punctuation dropped, hyphens split ("un-mute" -> "un mute").
 */
export function normalizeUtterance(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[-_]/g, ' ')
    .replace(/[^a-z ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const wordCount = (normalized: string) => (normalized ? normalized.split(' ').length : 0);

/** The command an utterance consists of, or null if it is anything else. */
export function parseCommand(text: string, lang: Lang = 'en'): Command | null {
  return LOOKUP[lang].get(normalizeUtterance(text)) ?? null;
}

/**
 * The command in a recognizer's n-best list (best guess first). The best guess
 * wins if it is a command. A lower guess counts only when the best guess is at
 * most two words long, or no longer than that guess's phrase ("coupe le micro"
 * is three), so a mishearing like "a meal" can still be "unmute", while
 * conversation such as "don't mute me" never triggers.
 */
export function parseAlternatives(alternatives: readonly string[], lang: Lang = 'en'): Command | null {
  const [best, ...rest] = alternatives;
  if (best === undefined) return null;
  const cmd = parseCommand(best, lang);
  if (cmd) return cmd;
  const bestWords = wordCount(normalizeUtterance(best));
  for (const alt of rest) {
    const phrase = normalizeUtterance(alt);
    const c = LOOKUP[lang].get(phrase);
    if (c && bestWords <= Math.max(2, wordCount(phrase))) return c;
  }
  return null;
}
