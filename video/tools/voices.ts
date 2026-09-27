/**
 * Generates the reel's voices and sound effects with ElevenLabs.
 *
 *   npm run voices                      # generate what's missing or changed
 *   npm run voices -- --force prius-mute  # a new take of one line or effect
 *   npm run voices -- --stt             # then run every phone line through the real recognizer
 *
 * Writes public/voices/<id>.mp3, public/sfx/<id>.mp3 and src/media.json
 * (durations and word timings, imported by the reel). Takes are not
 * deterministic, so the generated files are committed and only rebuilt on
 * demand. Needs ELEVENLABS_API_KEY in the repo's .env.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LINES, spokenText, VOICES, type Line } from '../src/lines';
import type { Media, Word } from '../src/media';
import { SFX, type Sfx } from '../src/sfx';
import { durationSeconds, ffmpeg } from './ffmpeg';

const API = 'https://api.elevenlabs.io/v1';
const TTS_MODEL = 'eleven_v3';
const SFX_MODEL = 'eleven_text_to_sound_v2';
const FORMAT = 'mp3_44100_128';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = (...p: string[]) => path.join(root, ...p);
const MEDIA_JSON = out('src', 'media.json');

const key = process.env.ELEVENLABS_API_KEY;
if (!key) {
  console.error('ELEVENLABS_API_KEY is not set (add it to the repo .env).');
  process.exit(1);
}

const args = process.argv.slice(2);
const force = new Set(args.flatMap((a, i) => (args[i - 1] === '--force' ? [a] : [])));
const runStt = args.includes('--stt');

const hash = (value: unknown) => createHash('sha1').update(JSON.stringify(value)).digest('hex').slice(0, 12);

async function call(url: string, init: RequestInit): Promise<Response> {
  const res = await fetch(url, { ...init, headers: { 'xi-api-key': key!, ...init.headers } });
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${url} -> ${res.status}: ${await res.text()}`);
  return res;
}

async function tts(line: Line): Promise<Buffer> {
  const res = await call(`${API}/text-to-speech/${VOICES[line.speaker]}?output_format=${FORMAT}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({ text: line.text, model_id: TTS_MODEL, voice_settings: { stability: 0.5 } }),
  });
  return Buffer.from(await res.arrayBuffer());
}

/** Word timings for the captions, from ElevenLabs forced alignment on the tag-free text. */
async function align(audio: Buffer, text: string): Promise<Word[]> {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(audio)], { type: 'audio/mpeg' }), 'line.mp3');
  form.append('text', text);
  const res = await call(`${API}/forced-alignment`, { method: 'POST', body: form });
  const body = (await res.json()) as { words: { text: string; start: number; end: number }[] };
  return body.words
    .filter((w) => w.text.trim())
    .map((w) => ({ text: w.text.trim(), start: round(w.start), end: round(w.end) }));
}

async function soundEffect(sfx: Sfx): Promise<Buffer> {
  const res = await call(`${API}/sound-generation?output_format=${FORMAT}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({
      text: sfx.prompt,
      model_id: SFX_MODEL,
      duration_seconds: sfx.seconds,
      prompt_influence: 0.6,
      loop: sfx.loop ?? false,
    }),
  });
  return Buffer.from(await res.arrayBuffer());
}

const round = (s: number) => Math.round(s * 1000) / 1000;

function loadMedia(): Media {
  if (!existsSync(MEDIA_JSON)) return { voices: {}, sfx: {} };
  return JSON.parse(readFileSync(MEDIA_JSON, 'utf8')) as Media;
}

async function main() {
  const media = loadMedia();
  mkdirSync(out('public', 'voices'), { recursive: true });
  mkdirSync(out('public', 'sfx'), { recursive: true });
  let spent = 0;

  for (const line of LINES as readonly Line[]) {
    const file = out('public', 'voices', `${line.id}.mp3`);
    const h = hash({ voice: VOICES[line.speaker], model: TTS_MODEL, text: line.text });
    if (!force.has(line.id) && media.voices[line.id]?.hash === h && existsSync(file)) continue;
    const spoken = spokenText(line.text);
    process.stdout.write(`voice ${line.id} (${line.speaker}): ${spoken}\n`);
    const audio = await tts(line);
    writeFileSync(file, audio);
    spent += line.text.length;
    media.voices[line.id] = { hash: h, spoken, duration: round(durationSeconds(file)), words: await align(audio, spoken) };
    writeFileSync(MEDIA_JSON, JSON.stringify(media, null, 2) + '\n');
  }

  for (const sfx of SFX as readonly Sfx[]) {
    const file = out('public', 'sfx', `${sfx.id}.mp3`);
    const h = hash({ model: SFX_MODEL, prompt: sfx.prompt, seconds: sfx.seconds, loop: sfx.loop ?? false });
    if (!force.has(sfx.id) && media.sfx[sfx.id]?.hash === h && existsSync(file)) continue;
    process.stdout.write(`sfx ${sfx.id}: ${sfx.prompt}\n`);
    writeFileSync(file, await soundEffect(sfx));
    media.sfx[sfx.id] = { hash: h, duration: round(durationSeconds(file)) };
    writeFileSync(MEDIA_JSON, JSON.stringify(media, null, 2) + '\n');
  }

  // Drop entries for lines or effects that were removed from the lists.
  for (const id of Object.keys(media.voices)) if (!LINES.some((l) => l.id === id)) delete media.voices[id];
  for (const id of Object.keys(media.sfx)) if (!SFX.some((s) => s.id === id)) delete media.sfx[id];
  writeFileSync(MEDIA_JSON, JSON.stringify(media, null, 2) + '\n');
  console.log(`done (~${spent} characters of TTS this run)`);

  if (runStt) sttCheck();
}

/**
 * Every line a phone speaks, through the real GoogleSpeechRecognizer + parser
 * (server/src/tools/stt-check.ts): command lines must parse as their command,
 * everything else ("don't mute me…") as nothing. File names follow stt-check's
 * "<speaker>-<what was said>.wav" convention.
 */
function sttCheck() {
  const dir = out('out', 'stt');
  mkdirSync(dir, { recursive: true });
  const files: string[] = [];
  for (const line of LINES as readonly Line[]) {
    if (!line.phone) continue;
    const slug = spokenText(line.text)
      .toLowerCase()
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const wav = path.join(dir, `${line.phone}-${slug}.wav`);
    ffmpeg(['-i', out('public', 'voices', `${line.id}.mp3`), '-ac', '1', '-ar', '16000', '-sample_fmt', 's16', wav]);
    files.push(wav);
  }
  const repo = path.resolve(root, '..');
  execFileSync(
    process.execPath,
    [path.join(repo, 'node_modules', 'tsx', 'dist', 'cli.mjs'), '--env-file=.env', 'server/src/tools/stt-check.ts', ...files],
    { cwd: repo, stdio: 'inherit' },
  );
}

await main();
