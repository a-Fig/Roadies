import { SAMPLE_RATE, type Recognizer, type RecognizerSession } from './types';

/**
 * Hears nothing from audio. For local development and tests, where there are
 * no Google credentials; transcripts are injected via POST /dev/say instead.
 * Counts audio so tests can check the listener really receives it.
 */
export class FakeRecognizer implements Recognizer {
  readonly sampleRate = SAMPLE_RATE;
  /** Samples received per participant. */
  readonly samples = new Map<string, number>();

  open(participantId: string): RecognizerSession {
    return {
      write: (pcm) => this.samples.set(participantId, (this.samples.get(participantId) ?? 0) + pcm.length),
      close: () => {},
    };
  }
}
