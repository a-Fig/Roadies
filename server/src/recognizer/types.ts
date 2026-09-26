/** 16 kHz mono PCM in, final transcripts out. One session per participant track. */
export interface RecognizerSession {
  write(pcm: Int16Array): void;
  close(): void;
}

export interface Recognizer {
  readonly sampleRate: number;
  open(participantId: string, onFinal: (text: string) => void): RecognizerSession;
}

export const SAMPLE_RATE = 16_000;
