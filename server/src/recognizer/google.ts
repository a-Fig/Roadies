import { mkdirSync } from 'node:fs';
import path from 'node:path';
import speech from '@google-cloud/speech';
import { COMMAND_PHRASES } from '@roadies/shared';
import { computeRms, SpeechGate } from './gate';
import { SAMPLE_RATE, type Recognizer, type RecognizerSession, type UtteranceInfo } from './types';
import { writeWav } from './wav';

type StreamingRequest = Parameters<InstanceType<typeof speech.SpeechClient>['streamingRecognize']>[0];
type StreamingResponse = { results?: { isFinal?: boolean; alternatives?: { transcript?: string | null }[] }[] };

export interface GoogleRecognizerOptions {
  log?: (msg: string) => void;
  /** Log every utterance the gate cuts (LOG_TRANSCRIPTS=1). */
  verbose?: boolean;
  /** Save every utterance as a WAV here, named with what was heard (SAVE_UTTERANCES). */
  saveDir?: string | null;
}

/**
 * Google Speech-to-Text (v1 streaming). A speech gate cuts each participant's
 * audio into utterances; each utterance gets its own short stream, so silence
 * is never sent and streams never approach Google's time limit. Credentials
 * come from the environment (Application Default Credentials).
 *
 * Asks for several alternatives: a short command is often misheard as its
 * best guess ("a meal") while the right word is further down the list.
 */
export class GoogleSpeechRecognizer implements Recognizer {
  readonly sampleRate = SAMPLE_RATE;
  private readonly client = new speech.SpeechClient();
  private readonly request: StreamingRequest;
  private readonly log: (msg: string) => void;
  private readonly verbose: boolean;
  private readonly saveDir: string | null;

  constructor(model: string, opts: GoogleRecognizerOptions = {}) {
    this.log = opts.log ?? console.warn;
    this.verbose = opts.verbose ?? false;
    this.saveDir = opts.saveDir ?? null;
    if (this.saveDir) mkdirSync(this.saveDir, { recursive: true });
    this.request = {
      config: {
        encoding: 'LINEAR16',
        sampleRateHertz: SAMPLE_RATE,
        languageCode: 'en-US',
        model,
        maxAlternatives: 5,
        profanityFilter: false,
        speechContexts: [{ phrases: [...COMMAND_PHRASES], boost: 20 }],
      },
      interimResults: false,
      singleUtterance: false,
    };
  }

  open(participantId: string, onFinal: (heard: readonly string[], info?: UtteranceInfo) => void): RecognizerSession {
    let stream: ReturnType<typeof this.client.streamingRecognize> | null = null;
    // The utterance being streamed; each stream's handlers keep their own.
    let current = newUtterance();
    const write = (pcm: Int16Array) => {
      if (!stream || stream.destroyed) return;
      current.peakRms = Math.max(current.peakRms, computeRms(pcm));
      current.ms += (pcm.length / SAMPLE_RATE) * 1000;
      if (this.saveDir) current.pcm.push(pcm.slice());
      stream.write(Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength));
    };
    const gate = new SpeechGate(
      { sampleRate: SAMPLE_RATE },
      {
        start: (preroll) => {
          const s = this.client.streamingRecognize(this.request);
          const u = (current = newUtterance());
          s.on('data', (res: StreamingResponse) => {
            for (const r of res.results ?? []) {
              const heard = (r.alternatives ?? []).map((a) => a.transcript?.trim() ?? '').filter(Boolean);
              if (r.isFinal && heard.length) {
                u.heard.push(heard[0]!);
                const latencyMs = u.endedAt ? Date.now() - u.endedAt : -1;
                onFinal(heard, { peakRms: Math.round(u.peakRms), ms: Math.round(u.ms), latencyMs });
              }
            }
          });
          s.on('error', (err: Error) => this.log(`[stt] ${participantId}: ${err.message}`));
          s.on('close', () => this.save(participantId, u));
          stream = s;
          preroll.forEach(write);
        },
        audio: write,
        end: () => {
          current.endedAt = Date.now();
          if (this.verbose) {
            const { ms, peakRms } = current;
            console.log(`[gate] ${participantId}: ${Math.round(ms)} ms, peak ${Math.round(peakRms)}, floor ${Math.round(gate.floor)}`);
          }
          stream?.end();
          stream = null;
        },
      },
    );
    return {
      write: (pcm) => gate.write(pcm),
      close: () => gate.flush(),
    };
  }

  private save(participantId: string, u: Utterance): void {
    if (!this.saveDir || u.pcm.length === 0) return;
    const stamp = new Date(u.startedAt).toISOString().replace(/[:.]/g, '-');
    const heard = slug(u.heard.join(' ')) || 'nothing';
    const file = path.join(this.saveDir, `${stamp}_${slug(participantId)}_${heard}.wav`);
    try {
      writeWav(file, u.pcm, SAMPLE_RATE);
    } catch (err) {
      this.log(`[stt] could not save ${file}: ${(err as Error).message}`);
    }
    u.pcm = [];
  }
}

interface Utterance {
  startedAt: number;
  peakRms: number;
  ms: number;
  endedAt: number;
  /** Best guess of each final, for the saved file's name. */
  heard: string[];
  pcm: Int16Array[];
}

const newUtterance = (): Utterance => ({ startedAt: Date.now(), peakRms: 0, ms: 0, endedAt: 0, heard: [], pcm: [] });

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
