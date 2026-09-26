import { describe, expect, it } from 'vitest';
import { isLang, LANGS, type Lang } from '../src/lang';
import {
  applyCommand,
  COMMANDS,
  commandPhrases,
  INITIAL_VOICE_STATE,
  isHearing,
  isTransmitting,
  joinState,
  MISHEARINGS,
  normalizeUtterance,
  parseAlternatives,
  parseCommand,
  PHRASES,
  sayPhrase,
  type Command,
  type VoiceState,
} from '../src/voice';

const run = (...cmds: Command[]): VoiceState => cmds.reduce(applyCommand, INITIAL_VOICE_STATE);

describe('voice state (Discord semantics)', () => {
  it('joins live', () => {
    expect(isTransmitting(INITIAL_VOICE_STATE)).toBe(true);
    expect(isHearing(INITIAL_VOICE_STATE)).toBe(true);
  });

  it('normal mode joins live; demo mode joins muted but hearing', () => {
    expect(joinState('live')).toEqual(INITIAL_VOICE_STATE);
    const demo = joinState('demo');
    expect(isTransmitting(demo)).toBe(false);
    expect(isHearing(demo)).toBe(true);
    expect(isTransmitting(applyCommand(demo, 'unmute'))).toBe(true);
  });

  it('mute stops transmitting but keeps hearing', () => {
    const s = run('mute');
    expect(isTransmitting(s)).toBe(false);
    expect(isHearing(s)).toBe(true);
  });

  it('deafen stops both, and undeafen restores the previous mute', () => {
    expect(isTransmitting(run('deafen'))).toBe(false);
    expect(isHearing(run('deafen'))).toBe(false);
    expect(isTransmitting(run('deafen', 'undeafen'))).toBe(true);
    expect(isTransmitting(run('mute', 'deafen', 'undeafen'))).toBe(false);
  });

  it('unmute while deafened also undeafens', () => {
    const s = run('mute', 'deafen', 'unmute');
    expect(s).toEqual({ selfMute: false, selfDeaf: false, connected: true });
  });

  it('disconnect silences everything and connect restores it', () => {
    const s = run('disconnect');
    expect(isTransmitting(s)).toBe(false);
    expect(isHearing(s)).toBe(false);
    expect(run('disconnect', 'connect')).toEqual(INITIAL_VOICE_STATE);
  });

  it('keeps mute and deafen across a disconnect', () => {
    expect(run('mute', 'disconnect', 'connect').selfMute).toBe(true);
  });
});

describe('parseCommand', () => {
  it.each([
    ['mute', 'mute'],
    ['Mute.', 'mute'],
    ['  UNMUTE!  ', 'unmute'],
    ['un-mute', 'unmute'],
    ['Un mute', 'unmute'],
    ['deafen', 'deafen'],
    ['Undeafen', 'undeafen'],
    ['disconnect', 'disconnect'],
    ['connect', 'connect'],
    ['Reconnect', 'connect'],
  ])('%j -> %s', (text, cmd) => {
    expect(parseCommand(text)).toBe(cmd);
  });

  it.each([
    "don't mute me",
    'can you mute',
    'mute mute',
    'I am connecting now',
    'this traffic is terrible',
    '',
  ])('ignores conversation: %j', (text) => {
    expect(parseCommand(text)).toBeNull();
  });
});

describe('parseAlternatives (n-best list)', () => {
  it('takes the best guess when it is a command', () => {
    expect(parseAlternatives(['mute', 'unmute'])).toBe('mute');
  });

  it('rescues a short mishearing from a lower guess', () => {
    expect(parseAlternatives(['a meal', 'unmute', 'a mule'])).toBe('unmute');
    expect(parseAlternatives(['undefined', 'undeafen'])).toBe('undeafen');
  });

  it('never looks past conversation', () => {
    expect(parseAlternatives(["don't mute me", 'mute'])).toBeNull();
    expect(parseAlternatives(["I'm on mute", 'unmute'])).toBeNull();
  });

  it('takes the highest-ranked command among lower guesses', () => {
    expect(parseAlternatives(['mute it', 'mute', 'unmute it', 'unmute'])).toBe('mute');
  });

  it('handles an empty list', () => {
    expect(parseAlternatives([])).toBeNull();
  });

  it('accepts known mishearings without boosting them', () => {
    // A real "deafen" from the 2026-09-26 voice round.
    expect(parseAlternatives(['Duffin', 'Stephan', 'Stefan', 'bethanne', 'bethan'])).toBe('deafen');
    expect(parseCommand('Stefan.')).toBe('deafen');
    expect(commandPhrases('en')).not.toContain('stephan');
    expect(commandPhrases('en')).toContain('deafen');
    // An en-US mishearing says nothing about other recognizers.
    expect(parseCommand('Stefan.', 'fr')).toBeNull();
  });
});

/** Every accepted phrase of a language: its own, its mishearings, and the English ones. */
function accepted(lang: Lang): [string, Command][] {
  return [PHRASES.en, PHRASES[lang], MISHEARINGS[lang]].flatMap((table) =>
    Object.entries(table).flatMap(([cmd, phrases]) => phrases.map((p) => [p, cmd as Command] as [string, Command])),
  );
}

describe('languages', () => {
  it('knows its languages', () => {
    expect(LANGS).toEqual(['en', 'fr', 'es', 'vi']);
    expect(isLang('vi')).toBe(true);
    expect(isLang('de')).toBe(false);
    expect(isLang(undefined)).toBe(false);
  });

  it('folds accents, đ and punctuation', () => {
    expect(normalizeUtterance('Micro coupé.')).toBe('micro coupe');
    expect(normalizeUtterance('Déconnecte-moi !')).toBe('deconnecte moi');
    expect(normalizeUtterance('¿Silénciame?')).toBe('silenciame');
    expect(normalizeUtterance('NGẮT KẾT NỐI')).toBe('ngat ket noi');
    expect(normalizeUtterance('Đi đâu')).toBe('di dau');
    // Decomposed input (a combining accent) folds the same way.
    expect(normalizeUtterance('coupé')).toBe('coupe');
  });

  it.each(LANGS)('every %s phrase parses, as written, shouted and without accents', (lang) => {
    for (const [phrase, cmd] of accepted(lang)) {
      expect(parseCommand(phrase, lang), phrase).toBe(cmd);
      expect(parseCommand(`${phrase.toUpperCase()}!`, lang), phrase).toBe(cmd);
      expect(parseCommand(normalizeUtterance(phrase), lang), phrase).toBe(cmd);
    }
  });

  it.each(LANGS)('English commands work under %s', (lang) => {
    for (const cmd of COMMANDS) expect(parseCommand(cmd, lang)).toBe(cmd);
    expect(parseAlternatives(['a meal', 'unmute'], lang)).toBe('unmute');
  });

  it.each(LANGS)('no %s phrase means two different commands', (lang) => {
    const seen = new Map<string, Command>();
    for (const [phrase, cmd] of accepted(lang)) {
      const key = normalizeUtterance(phrase);
      expect(seen.get(key) ?? cmd, `"${phrase}"`).toBe(cmd);
      seen.set(key, cmd);
    }
  });

  it('only accepts a language’s phrases for drivers who chose it', () => {
    expect(parseCommand('coupe le micro', 'fr')).toBe('mute');
    expect(parseCommand('coupe le micro')).toBeNull();
    expect(parseCommand('apaga el micro', 'fr')).toBeNull();
    expect(parseCommand('tắt mic', 'es')).toBeNull();
  });

  it.each([
    ['fr', 'je vais couper le micro'],
    ['fr', 'ne coupe pas le micro'],
    ['fr', 'coupe pas le micro'],
    ['fr', 'tu peux remettre le son ?'],
    ['fr', 'on est coincés dans le bouchon'],
    ['es', 'no apagues el micro'],
    ['es', 'voy a apagar el micro'],
    ['es', '¿me escuchas?'],
    ['es', 'hay mucho tráfico hoy'],
    ['vi', 'đừng tắt mic'],
    ['vi', 'tôi sẽ tắt mic'],
    ['vi', 'bạn nghe rõ không'],
    ['vi', 'kẹt xe quá'],
  ] as [Lang, string][])('%s ignores conversation: %j', (lang, text) => {
    expect(parseCommand(text, lang)).toBeNull();
    expect(parseAlternatives([text], lang)).toBeNull();
  });

  it('looks at lower guesses only for short best guesses', () => {
    // No longer than the command phrase: a mishearing, rescued.
    expect(parseAlternatives(['coupe le micron', 'coupe le micro'], 'fr')).toBe('mute');
    expect(parseAlternatives(['tắc mic', 'tắt mic'], 'vi')).toBe('mute');
    // Longer than the command phrase: conversation, never rescued.
    expect(parseAlternatives(['je coupe le micro', 'coupe le micro'], 'fr')).toBeNull();
    expect(parseAlternatives(['no apagues el micro', 'apaga el micro'], 'es')).toBeNull();
    expect(parseAlternatives(['đừng tắt mic', 'tắt mic'], 'vi')).toBeNull();
    expect(parseAlternatives(["don't mute me", 'mute'], 'fr')).toBeNull();
  });

  it('hints the language’s phrases with accents, plus English, without mishearings', () => {
    const fr = commandPhrases('fr');
    expect(fr).toContain('micro coupé');
    expect(fr).toContain('mute');
    expect(new Set(fr).size).toBe(fr.length);
    expect(commandPhrases('en')).toEqual(Object.values(PHRASES.en).flat());
    for (const lang of LANGS) {
      for (const heard of Object.values(MISHEARINGS[lang]).flat()) expect(commandPhrases(lang)).not.toContain(heard);
    }
  });

  it('tells people to say each language’s first phrase', () => {
    expect(sayPhrase('en', 'unmute')).toBe('unmute');
    for (const lang of LANGS) for (const cmd of COMMANDS) expect(sayPhrase(lang, cmd)).toBe(PHRASES[lang][cmd][0]);
  });
});
