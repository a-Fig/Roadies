import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  INITIAL_VOICE_STATE,
  isHearing,
  isTransmitting,
  joinState,
  parseCommand,
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
