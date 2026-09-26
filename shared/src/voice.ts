import type { Mode } from './protocol';

export const COMMANDS = ['mute', 'unmute', 'deafen', 'undeafen', 'disconnect', 'connect', 'random'] as const;
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
    case 'random':
      // Only meaningful while disconnected (World ignores it otherwise); landing
      // somewhere always reconnects.
      return { ...state, connected: true };
  }
}

/** Others can hear you. */
export const isTransmitting = (s: VoiceState) => s.connected && !s.selfMute && !s.selfDeaf;

/** You can hear others. */
export const isHearing = (s: VoiceState) => s.connected && !s.selfDeaf;

/**
 * Phrases accepted as each command. The whole utterance must be one of these;
 * "don't mute me" is conversation, not a command. Extra entries cover common
 * speech-to-text splits of the same word.
 */
const PHRASES: Record<Command, readonly string[]> = {
  mute: ['mute', 'mute mic', 'mute me'],
  unmute: ['unmute', 'un mute', 'unmute me', 'on mute'],
  deafen: ['deafen', 'deafen me', 'deafin', 'def in'],
  undeafen: ['undeafen', 'un deafen', 'undeafen me', 'on deafen'],
  disconnect: ['disconnect', 'dis connect', 'disconnect me'],
  connect: ['connect', 'reconnect', 'connect me'],
  random: ['random', 'random room'],
};

const PHRASE_TO_COMMAND = new Map<string, Command>(
  Object.entries(PHRASES).flatMap(([cmd, phrases]) =>
    phrases.map((p) => [p, cmd as Command] as const),
  ),
);

/** All phrases, for boosting the speech recognizer. */
export const COMMAND_PHRASES: readonly string[] = [...PHRASE_TO_COMMAND.keys()];

export function normalizeUtterance(text: string): string {
  return text
    .toLowerCase()
    .replace(/[-_]/g, ' ')
    .replace(/[^a-z ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The command an utterance consists of, or null if it is anything else. */
export function parseCommand(text: string): Command | null {
  return PHRASE_TO_COMMAND.get(normalizeUtterance(text)) ?? null;
}

/**
 * The command in a recognizer's n-best list (best guess first). The best guess
 * wins if it is a command. Lower guesses count only when the best guess is one
 * or two words, so a mishearing like "a meal" can still be "unmute", while
 * conversation such as "don't mute me" never triggers.
 */
export function parseAlternatives(alternatives: readonly string[]): Command | null {
  const [best, ...rest] = alternatives;
  if (best === undefined) return null;
  const cmd = parseCommand(best);
  if (cmd || normalizeUtterance(best).split(' ').length > 2) return cmd;
  for (const alt of rest) {
    const c = parseCommand(alt);
    if (c) return c;
  }
  return null;
}
