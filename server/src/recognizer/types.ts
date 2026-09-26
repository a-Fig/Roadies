/**
 * 16 kHz mono PCM in, final transcripts out. One session per participant track.
 * Each final is the recognizer's n-best list for one utterance, best guess first.
 */
export interface RecognizerSession {
  write(pcm: Int16Array): void;
  close(): void;
}

/** How an utterance sounded, for tuning (LOG_TRANSCRIPTS=1). */
export interface UtteranceInfo {
  /** Loudest frame, RMS on the int16 scale. */
  peakRms: number;
  /** Utterance length including preroll, ms. */
  ms: number;
  /** From the end of the utterance to the final transcript, ms (negative: before the end). */
  latencyMs: number;
}

export interface Recognizer {
  readonly sampleRate: number;
  open(participantId: string, onFinal: (heard: readonly string[], info?: UtteranceInfo) => void): RecognizerSession;
}

export const SAMPLE_RATE = 16_000;
