import { describe, expect, it } from 'vitest';
import { SpeechGate } from '../src/recognizer/gate';

const RATE = 16_000;
const FRAME = RATE / 100; // 10 ms

const tone = (amplitude: number) =>
  Int16Array.from({ length: FRAME }, (_, i) => Math.round(amplitude * Math.sin((i / FRAME) * Math.PI * 8)));

function run(frames: Int16Array[]) {
  const events: string[] = [];
  let audioFrames = 0;
  let prerollFrames = 0;
  const gate = new SpeechGate(
    { sampleRate: RATE },
    {
      start: (p) => {
        prerollFrames = p.length;
        events.push('start');
      },
      audio: () => audioFrames++,
      end: () => events.push('end'),
    },
  );
  frames.forEach((f) => gate.write(f));
  return { events, audioFrames, prerollFrames, gate };
}

const repeat = (frame: Int16Array, ms: number) => Array.from({ length: ms / 10 }, () => frame);
const quiet = tone(50);
const voice = tone(6000);
/** Tracks start with a moment of quiet while the gate learns the room. */
const lead = repeat(quiet, 500);

describe('SpeechGate', () => {
  it('cuts one utterance out of silence, with pre-roll', () => {
    const r = run([...repeat(quiet, 1000), ...repeat(voice, 500), ...repeat(quiet, 1000)]);
    expect(r.events).toEqual(['start', 'end']);
    expect(r.prerollFrames).toBeGreaterThanOrEqual(25); // ~300 ms of lead-in
    expect(r.audioFrames).toBeGreaterThan(40);
  });

  it('ignores clicks shorter than the onset time', () => {
    const r = run([...repeat(quiet, 500), ...repeat(voice, 30), ...repeat(quiet, 500)]);
    expect(r.events).toEqual([]);
  });

  it('keeps short pauses inside one utterance', () => {
    const r = run([...lead, ...repeat(voice, 300), ...repeat(quiet, 400), ...repeat(voice, 300), ...repeat(quiet, 1000)]);
    expect(r.events).toEqual(['start', 'end']);
  });

  it('splits utterances separated by a real pause', () => {
    const r = run([...lead, ...repeat(voice, 300), ...repeat(quiet, 1200), ...repeat(voice, 300), ...repeat(quiet, 1000)]);
    expect(r.events).toEqual(['start', 'end', 'start', 'end']);
  });

  it('adapts to steady background noise', () => {
    const hum = tone(900);
    const r = run([...repeat(hum, 3000), ...repeat(tone(1100), 500), ...repeat(voice, 400), ...repeat(hum, 1000)]);
    expect(r.events).toEqual(['start', 'end']);
  });

  it('recovers when someone is already talking as the track starts', () => {
    const r = run([...repeat(voice, 800), ...repeat(quiet, 1000), ...repeat(voice, 300), ...repeat(quiet, 1000)]);
    expect(r.events).toEqual(['start', 'end']);
  });

  it('caps runaway utterances', () => {
    const r = run([...lead, ...repeat(voice, 9000)]);
    expect(r.events.slice(0, 2)).toEqual(['start', 'end']);
  });

  it('flush ends an utterance in progress', () => {
    const r = run([...lead, ...repeat(voice, 300)]);
    r.gate.flush();
    expect(r.events).toEqual(['start', 'end']);
  });
});
