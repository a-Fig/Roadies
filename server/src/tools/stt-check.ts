/**
 * Speech-to-text tuning check. Feeds WAV files (16 kHz mono 16-bit) through the
 * real GoogleSpeechRecognizer, speech gate included, and prints what Google
 * heard and which command it parses to. Uses the same env as the server.
 *
 *   npx tsx --env-file=.env server/src/tools/stt-check.ts clips/*.wav
 *
 * A file named like "zira-unmute.wav" is expected to parse as "unmute"; files
 * whose name has no command word ("dont-mute-me", "can-you-hear-me") are
 * expected to parse as nothing.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { COMMANDS, parseCommand, type Command } from '@roadies/shared';
import { GoogleSpeechRecognizer } from '../recognizer/google';
import { SAMPLE_RATE } from '../recognizer/types';

const FRAME = SAMPLE_RATE / 100; // 10 ms
const NOISE_RMS = 80; // a quiet room through a phone mic

function readWav(file: string): Int16Array {
  const buf = readFileSync(file);
  if (buf.toString('ascii', 0, 4) !== 'RIFF') throw new Error(`${file}: not a WAV file`);
  let at = 12;
  while (at < buf.length) {
    const id = buf.toString('ascii', at, at + 4);
    const size = buf.readUInt32LE(at + 4);
    if (id === 'fmt ') {
      const channels = buf.readUInt16LE(at + 10);
      const rate = buf.readUInt32LE(at + 12);
      const bits = buf.readUInt16LE(at + 22);
      if (channels !== 1 || rate !== SAMPLE_RATE || bits !== 16) {
        throw new Error(`${file}: need 16 kHz mono 16-bit, got ${rate} Hz ${channels} ch ${bits}-bit`);
      }
    } else if (id === 'data') {
      const data = buf.subarray(at + 8, at + 8 + size);
      return new Int16Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
    }
    at += 8 + size + (size % 2);
  }
  throw new Error(`${file}: no data chunk`);
}

/** 1 s of room noise, the clip (over noise), then 1.5 s of room noise. */
function withRoom(clip: Int16Array): Int16Array {
  const lead = SAMPLE_RATE;
  const tail = SAMPLE_RATE * 1.5;
  const out = new Int16Array(lead + clip.length + tail);
  const amp = NOISE_RMS * Math.sqrt(3); // uniform noise with this RMS
  for (let i = 0; i < out.length; i++) {
    const speech = i >= lead && i < lead + clip.length ? clip[i - lead]! : 0;
    out[i] = Math.max(-32768, Math.min(32767, Math.round(speech + (Math.random() * 2 - 1) * amp)));
  }
  return out;
}

function expected(file: string): Command | null {
  const words = path.basename(file, '.wav').toLowerCase().split(/[-_ ]/);
  // Longest command word first, so "unmute" wins over "mute".
  const cmds = [...COMMANDS].sort((a, b) => b.length - a.length);
  if (words.includes('dont') || words.includes('im') || words.includes('can')) return null;
  return cmds.find((c) => words.includes(c)) ?? null;
}

async function check(recognizer: GoogleSpeechRecognizer, file: string) {
  const heard: string[] = [];
  let latencyMs = -1;
  const session = recognizer.open(path.basename(file), (text, info) => {
    heard.push(text);
    latencyMs = info?.latencyMs ?? -1;
  });
  const audio = withRoom(readWav(file));
  for (let i = 0; i < audio.length; i += FRAME) session.write(audio.subarray(i, i + FRAME));
  session.close();
  // Finals arrive shortly after the stream ends.
  for (let waited = 0; waited < 5000 && heard.length === 0; waited += 100) await new Promise((r) => setTimeout(r, 100));
  await new Promise((r) => setTimeout(r, 300));
  const cmd = heard.length === 1 ? parseCommand(heard[0]!) : null;
  const want = expected(file);
  return { file: path.basename(file), heard, cmd, want, ok: cmd === want, latencyMs };
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: stt-check.ts <file.wav>...');
  process.exit(2);
}
const model = process.env.GOOGLE_STT_MODEL ?? 'command_and_search';
const recognizer = new GoogleSpeechRecognizer(model, console.warn, true);
console.log(`model: ${model}`);
const results = await Promise.all(files.map((f) => check(recognizer, f)));
for (const r of results) {
  const heard = r.heard.length ? r.heard.map((h) => `"${h}"`).join(' + ') : '(nothing)';
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.file.padEnd(28)} ${heard.padEnd(24)} -> ${r.cmd ?? '-'}  (want ${r.want ?? '-'})  ${r.latencyMs} ms`);
}
const failed = results.filter((r) => !r.ok).length;
const latencies = results.map((r) => r.latencyMs).filter((l) => l >= 0).sort((a, b) => a - b);
const median = latencies[Math.floor(latencies.length / 2)] ?? -1;
console.log(`${results.length - failed}/${results.length} as expected, median latency ${median} ms after the gate closed`);
process.exit(failed ? 1 : 0);
