import type { Lang } from '@roadies/shared';
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
  /** The language of each participant's open session. */
  readonly langs = new Map<string, Lang>();

  open(participantId: string, lang: Lang): RecognizerSession {
    this.langs.set(participantId, lang);
    return {
      write: (pcm) => this.samples.set(participantId, (this.samples.get(participantId) ?? 0) + pcm.length),
      close: () => {},
    };
  }
}
