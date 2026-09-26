/**
 * Speech-to-text tuning check. Feeds WAV files (16 kHz mono 16-bit) through the
 * real GoogleSpeechRecognizer, speech gate included, and prints what Google
 * heard and which command it parses to. Uses the same env as the server.
 *
 *   npx tsx --env-file=.env server/src/tools/stt-check.ts [--lang fr] clips/*.wav
 *
 * Name files "<speaker>-<what was said>.wav": "zira-unmute.wav" is expected to
 * parse as "unmute", "zira-dont-mute-me.wav" as nothing. Trailing digits are
 * ignored ("tyler-deafen-03.wav"). Accents may be left out of file names
 * ("remi-coupe-le-micro.wav"): parsing folds them anyway. `--lang` picks the
 * recognizer language and the phrases to parse with (default en). Audio is
 * sent in real time, as in production.
 */
import path from 'node:path';
import { isLang, LANGS, parseAlternatives, parseCommand, type Command, type Lang } from '@roadies/shared';
import { GoogleSpeechRecognizer } from '../recognizer/google';
import { SAMPLE_RATE } from '../recognizer/types';
import { readWav } from '../recognizer/wav';

const FRAME = SAMPLE_RATE / 100; // 10 ms
const NOISE_RMS = 80; // a quiet room through a phone mic

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

/** What the speaker said, from the file name, run through the real parser. */
function expected(file: string): Command | null {
  const [, ...said] = path.basename(file).replace(/\.wav$/i, '').split(/[-_ ]/);
  return parseCommand(said.join(' '), lang);
}

async function check(recognizer: GoogleSpeechRecognizer, file: string) {
  const heard: (readonly string[])[] = [];
  let latencyMs = -1;
  const session = recognizer.open(path.basename(file), lang, (alternatives, info) => {
    heard.push(alternatives);
    latencyMs = info?.latencyMs ?? -1;
  });
  const audio = withRoom(readWav(file, SAMPLE_RATE));
  const started = Date.now();
  for (let i = 0, n = 0; i < audio.length; i += FRAME, n++) {
    session.write(audio.subarray(i, i + FRAME));
    const ahead = started + n * 10 - Date.now();
    if (ahead > 0) await new Promise((r) => setTimeout(r, ahead));
  }
  session.close();
  // Finals arrive shortly after the stream ends.
  for (let waited = 0; waited < 5000 && heard.length === 0; waited += 100) await new Promise((r) => setTimeout(r, 100));
  await new Promise((r) => setTimeout(r, 300));
  const cmd = heard.length === 1 ? parseAlternatives(heard[0]!, lang) : null;
  const want = expected(file);
  // Hearing nothing is a failure even for a clip that should not parse.
  return { file: path.basename(file), heard, cmd, want, ok: heard.length > 0 && cmd === want, latencyMs };
}

const files = process.argv.slice(2);
let lang: Lang = 'en';
const langFlag = files.indexOf('--lang');
if (langFlag >= 0) {
  const value = files.splice(langFlag, 2)[1];
  if (!isLang(value)) {
    console.error(`--lang must be one of: ${LANGS.join(', ')}`);
    process.exit(2);
  }
  lang = value;
}
if (files.length === 0) {
  console.error('usage: stt-check.ts [--lang en|fr|es|vi] <file.wav>...');
  process.exit(2);
}
const model = process.env.GOOGLE_STT_MODEL ?? 'command_and_search';
const recognizer = new GoogleSpeechRecognizer(model, { verbose: true });
console.log(`model: ${model}, language: ${lang}`);
const settled = await Promise.allSettled(files.map((f) => check(recognizer, f)));
const results = settled.flatMap((s, i) => {
  if (s.status === 'fulfilled') return [s.value];
  console.log(`FAIL ${path.basename(files[i]!)}: ${(s.reason as Error).message}`);
  return [{ file: path.basename(files[i]!), heard: [], cmd: null, want: null, ok: false, latencyMs: -1 }];
});
for (const r of results) {
  // Each final's guesses, best first: "a meal" | "unmute" + "..." for a second final.
  const heard = r.heard.length ? r.heard.map((alts) => alts.map((h) => `"${h}"`).join(' | ')).join(' + ') : '(nothing)';
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.file.padEnd(28)} -> ${(r.cmd ?? '-').padEnd(10)} (want ${r.want ?? '-'})  ${r.latencyMs} ms  ${heard}`);
}
const failed = results.filter((r) => !r.ok).length;
const latencies = results.map((r) => r.latencyMs).filter((l) => l >= 0).sort((a, b) => a - b);
const median = latencies[Math.floor(latencies.length / 2)] ?? -1;
console.log(`${results.length - failed}/${results.length} as expected, median latency ${median} ms after the gate closed`);
process.exit(failed ? 1 : 0);
