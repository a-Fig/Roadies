/** 16 kHz mono PCM in, final transcripts out. One session per participant track. */
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
  open(participantId: string, onFinal: (text: string, info?: UtteranceInfo) => void): RecognizerSession;
}

export const SAMPLE_RATE = 16_000;
