import type { Command } from '@roadies/shared';

// Original Discord-like earcons, synthesized so there are no audio files.

let ctx: AudioContext | null = null;

/** Call from a tap handler: browsers only allow audio after a user gesture. */
export function unlockAudio(): void {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
}

type Note = { freq: number; at: number; dur: number; type?: OscillatorType };

function play(notes: Note[], volume = 0.2): void {
  if (!ctx) return;
  const t0 = ctx.currentTime + 0.01;
  for (const n of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = n.type ?? 'sine';
    osc.frequency.setValueAtTime(n.freq, t0 + n.at);
    gain.gain.setValueAtTime(0.0001, t0 + n.at);
    gain.gain.exponentialRampToValueAtTime(volume, t0 + n.at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0 + n.at);
    osc.stop(t0 + n.at + n.dur + 0.02);
  }
}

function glide(from: number, to: number, dur: number, volume = 0.18): void {
  if (!ctx) return;
  const t0 = ctx.currentTime + 0.01;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(from, t0);
  osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

const n = (freq: number, at: number, dur: number, type?: OscillatorType): Note => ({ freq, at, dur, type });

export const chimes: Record<Command | 'join' | 'leave' | 'moved', () => void> = {
  mute: () => play([n(659, 0, 0.09), n(440, 0.07, 0.15)]),
  unmute: () => play([n(440, 0, 0.09), n(659, 0.07, 0.15)]),
  deafen: () => play([n(587, 0, 0.08), n(440, 0.06, 0.08), n(294, 0.12, 0.2)]),
  undeafen: () => play([n(294, 0, 0.08), n(440, 0.06, 0.08), n(587, 0.12, 0.2)]),
  disconnect: () => glide(520, 170, 0.38),
  connect: () => {
    glide(260, 620, 0.22);
    play([n(784, 0.2, 0.22)]);
  },
  moved: () => play([n(523, 0, 0.1, 'triangle'), n(659, 0.09, 0.1, 'triangle'), n(784, 0.18, 0.22, 'triangle')], 0.15),
  // Placeholder earcon; superseded when claude/sounds's FILES map (Discord mp3s) merges in.
  random: () => play([n(392, 0, 0.07, 'triangle'), n(659, 0.05, 0.07, 'triangle'), n(523, 0.1, 0.07, 'triangle'), n(784, 0.15, 0.18, 'triangle')], 0.14),
  join: () => play([n(1047, 0, 0.08, 'triangle'), n(1319, 0.08, 0.16, 'triangle')], 0.12),
  leave: () => play([n(1319, 0, 0.08, 'triangle'), n(988, 0.08, 0.16, 'triangle')], 0.12),
};
