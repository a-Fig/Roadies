export interface GateOptions {
  sampleRate: number;
  /** Audio kept from just before speech starts, ms. */
  prerollMs?: number;
  /** Silence that ends an utterance, ms. */
  hangoverMs?: number;
  /** Speech needed to start an utterance, ms. */
  onsetMs?: number;
  /** Utterances are cut off at this length, ms. */
  maxUtteranceMs?: number;
  /** RMS below this is always silence (int16 scale). */
  minRms?: number;
  /** Speech must be this many times louder than the noise floor. */
  floorRatio?: number;
  /** Time spent learning the noise floor before any utterance can start, ms. */
  warmupMs?: number;
}

export interface GateHandlers {
  start(preroll: Int16Array[]): void;
  audio(pcm: Int16Array): void;
  end(): void;
}

/**
 * Energy-based voice activity gate. Splits a continuous mic stream into
 * utterances so the recognizer only transcribes speech, one utterance per
 * request, which is what "whole utterance" command matching needs.
 */
export class SpeechGate {
  private readonly o: Required<GateOptions>;
  private readonly preroll: Int16Array[] = [];
  private prerollMs = 0;
  private noiseFloor = 0;
  private elapsedMs = 0;
  private speaking = false;
  private loudMs = 0;
  private quietMs = 0;
  private utteranceMs = 0;

  constructor(options: GateOptions, private readonly on: GateHandlers) {
    this.o = {
      prerollMs: 300,
      hangoverMs: 700,
      onsetMs: 60,
      maxUtteranceMs: 8000,
      minRms: 350,
      floorRatio: 3,
      warmupMs: 500,
      ...options,
    };
  }

  get isSpeaking(): boolean {
    return this.speaking;
  }

  /** Current background level (RMS), for tuning logs. */
  get floor(): number {
    return this.noiseFloor;
  }

  write(pcm: Int16Array): void {
    const ms = (pcm.length / this.o.sampleRate) * 1000;
    const rms = computeRms(pcm);
    const loud = rms > Math.max(this.o.minRms, this.noiseFloor * this.o.floorRatio);
    this.updateNoiseFloor(rms);
    this.elapsedMs += ms;

    if (!this.speaking) {
      this.pushPreroll(pcm, ms);
      this.loudMs = loud ? this.loudMs + ms : 0;
      if (this.loudMs >= this.o.onsetMs && this.elapsedMs >= this.o.warmupMs) {
        this.speaking = true;
        this.quietMs = 0;
        this.utteranceMs = this.prerollMs;
        this.on.start(this.preroll.splice(0));
        this.prerollMs = 0;
      }
      return;
    }

    this.on.audio(pcm);
    this.utteranceMs += ms;
    this.quietMs = loud ? 0 : this.quietMs + ms;
    if (this.quietMs >= this.o.hangoverMs || this.utteranceMs >= this.o.maxUtteranceMs) {
      this.speaking = false;
      this.loudMs = 0;
      this.on.end();
    }
  }

  /**
   * Background level: falls fast when it gets quieter, rises slowly otherwise,
   * so speech barely moves it but a steady hum is learned within seconds.
   */
  private updateNoiseFloor(rms: number): void {
    if (this.elapsedMs === 0) {
      this.noiseFloor = rms;
      return;
    }
    const rate = rms < this.noiseFloor ? 0.1 : this.speaking ? 0.001 : 0.005;
    this.noiseFloor += (rms - this.noiseFloor) * rate;
  }

  /** End any utterance in progress (e.g. the track went away). */
  flush(): void {
    if (this.speaking) {
      this.speaking = false;
      this.on.end();
    }
  }

  private pushPreroll(pcm: Int16Array, ms: number): void {
    this.preroll.push(pcm);
    this.prerollMs += ms;
    while (this.preroll.length > 1 && this.prerollMs - frameMs(this.preroll[0]!, this.o.sampleRate) >= this.o.prerollMs) {
      this.prerollMs -= frameMs(this.preroll.shift()!, this.o.sampleRate);
    }
  }
}

const frameMs = (pcm: Int16Array, sampleRate: number) => (pcm.length / sampleRate) * 1000;

export function computeRms(pcm: Int16Array): number {
  if (pcm.length === 0) return 0;
  let sum = 0;
  for (const s of pcm) sum += s * s;
  return Math.sqrt(sum / pcm.length);
}
