import type { Command } from '@roadies/shared';

// Discord's own voice sounds (web/public/audio, from Discord's web client),
// played through Web Audio so they start instantly over the call.

type Chime = Command | 'join' | 'leave' | 'moved';

const FILES: Record<Chime, string> = {
  mute: 'mute',
  unmute: 'unmute',
  deafen: 'deafen',
  undeafen: 'undeafen',
  disconnect: 'disconnect',
  // Discord plays the join sound when you join a channel yourself.
  connect: 'user_join',
  join: 'user_join',
  leave: 'user_leave',
  moved: 'user_moved',
};

const VOLUME = 0.6;

let ctx: AudioContext | null = null;
const buffers = new Map<string, Promise<AudioBuffer | null>>();

/** Call from a tap handler: browsers only allow audio after a user gesture. Also preloads the sounds. */
export function unlockAudio(): void {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  for (const file of new Set(Object.values(FILES))) void load(ctx, file);
}

function load(c: AudioContext, file: string): Promise<AudioBuffer | null> {
  let buffer = buffers.get(file);
  if (!buffer) {
    buffer = fetch(`/audio/${file}.mp3`)
      .then((res) => {
        if (!res.ok) throw new Error(`${file}.mp3: HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then((bytes) => c.decodeAudioData(bytes))
      .catch((err: unknown) => {
        console.warn('Sound failed to load', err);
        buffers.delete(file); // try again next time
        return null;
      });
    buffers.set(file, buffer);
  }
  return buffer;
}

function play(file: string): void {
  const c = ctx;
  if (!c) return;
  void load(c, file).then((buffer) => {
    if (!buffer) return;
    const source = c.createBufferSource();
    source.buffer = buffer;
    const gain = c.createGain();
    gain.gain.value = VOLUME;
    source.connect(gain).connect(c.destination);
    source.start();
  });
}

export const chimes = Object.fromEntries(
  Object.entries(FILES).map(([name, file]) => [name, () => play(file)]),
) as Record<Chime, () => void>;

export const CHIME_NAMES = Object.keys(FILES) as Chime[];
