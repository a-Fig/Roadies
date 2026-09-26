import type { Command } from '@roadies/shared';

// Original earcons in the style of Discord's (synthesized, no audio files):
// mute drops two notes and unmute climbs them, deafen is the same shape lower
// and longer, joins and leaves are small bubbly blips. Audition them at /sounds.

let ctx: AudioContext | null = null;
let bus: AudioNode | null = null;

/** Call from a tap handler: browsers only allow audio after a user gesture. */
export function unlockAudio(): void {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  bus ??= buildBus(ctx);
}

/** Soft low-pass, a short slap-back echo for a little room, and a limiter. */
function buildBus(c: AudioContext): AudioNode {
  const input = c.createBiquadFilter();
  input.type = 'lowpass';
  input.frequency.value = 4200;

  const limiter = c.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.12;
  const master = c.createGain();
  master.gain.value = 0.9;
  limiter.connect(master).connect(c.destination);

  const delay = c.createDelay(0.5);
  delay.delayTime.value = 0.085;
  const feedback = c.createGain();
  feedback.gain.value = 0.22;
  const wet = c.createGain();
  wet.gain.value = 0.16;
  input.connect(limiter);
  input.connect(delay);
  delay.connect(feedback).connect(delay);
  delay.connect(wet).connect(limiter);
  return input;
}

interface Blip {
  /** Target pitch, Hz. */
  freq: number;
  /** Start, seconds from now. */
  at: number;
  /** Decay time, seconds. */
  dur: number;
  /** Pitch it starts from, as a ratio of `freq`: < 1 scoops up into the note ("bloop"). */
  scoop?: number;
  /** Seconds to reach `freq` from the scoop. Longer reads as a glide. */
  bend?: number;
  gain?: number;
}

/** A round sine note with a quiet octave on top and a quick pitch scoop. */
function blip(c: AudioContext, out: AudioNode, t0: number, b: Blip): void {
  const t = t0 + b.at;
  const bend = b.bend ?? 0.035;
  const from = b.freq * (b.scoop ?? 0.84);
  const peak = b.gain ?? 0.32;

  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(peak, t + 0.006);
  env.gain.exponentialRampToValueAtTime(0.0001, t + b.dur);
  env.connect(out);

  const partials: [OscillatorType, number, number][] = [
    ['sine', 1, 1],
    ['triangle', 2, 0.12],
  ];
  for (const [type, mult, level] of partials) {
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from * mult, t);
    osc.frequency.exponentialRampToValueAtTime(b.freq * mult, t + bend);
    const g = c.createGain();
    g.gain.value = level;
    osc.connect(g).connect(env);
    osc.start(t);
    osc.stop(t + b.dur + 0.05);
  }
}

function play(...blips: Blip[]): void {
  if (!ctx || !bus) return;
  const t0 = ctx.currentTime + 0.01;
  for (const b of blips) blip(ctx, bus, t0, b);
}

const b = (freq: number, at: number, dur: number, extra: Partial<Blip> = {}): Blip => ({ freq, at, dur, ...extra });

// Pitches (Hz): G5 784, E5 659, D5 587, C5 523, A4 440, G4 392, E4 330, D4 294.
export const chimes: Record<Command | 'join' | 'leave' | 'moved', () => void> = {
  // Two quick notes, a fourth apart: down to go quiet, up to come back.
  mute: () => play(b(784, 0, 0.13), b(587, 0.075, 0.2)),
  unmute: () => play(b(587, 0, 0.13), b(784, 0.075, 0.2)),
  // The same idea an octave-ish lower and heavier: the room goes away / comes back.
  deafen: () => play(b(523, 0, 0.14, { gain: 0.34 }), b(392, 0.085, 0.14, { gain: 0.34 }), b(294, 0.17, 0.3, { gain: 0.36 })),
  undeafen: () => play(b(294, 0, 0.14, { gain: 0.34 }), b(392, 0.085, 0.14, { gain: 0.34 }), b(523, 0.17, 0.3, { gain: 0.36 })),
  // A long rounded glide: into the call, or out of it.
  connect: () => play(b(659, 0, 0.32, { scoop: 0.5, bend: 0.16 }), b(988, 0.15, 0.3, { gain: 0.24 })),
  disconnect: () => play(b(330, 0, 0.42, { scoop: 2, bend: 0.22, gain: 0.36 })),
  // You were moved to another room: three steps up.
  moved: () => play(b(523, 0, 0.14, { gain: 0.26 }), b(659, 0.09, 0.14, { gain: 0.26 }), b(784, 0.18, 0.28, { gain: 0.28 })),
  // Someone else joined or left: small, high and bubbly, so it never sounds like your own state changed.
  join: () => play(b(988, 0, 0.12, { scoop: 0.7, gain: 0.2 }), b(1319, 0.07, 0.18, { scoop: 0.8, gain: 0.2 })),
  leave: () => play(b(1319, 0, 0.12, { scoop: 1.2, gain: 0.2 }), b(988, 0.07, 0.18, { scoop: 1.2, gain: 0.2 })),
};

export const CHIME_NAMES = Object.keys(chimes) as (keyof typeof chimes)[];
