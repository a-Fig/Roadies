import speech from '@google-cloud/speech';
import { COMMAND_PHRASES } from '@roadies/shared';
import { SpeechGate } from './gate';
import { SAMPLE_RATE, type Recognizer, type RecognizerSession } from './types';

type StreamingRequest = Parameters<InstanceType<typeof speech.SpeechClient>['streamingRecognize']>[0];

/**
 * Google Speech-to-Text (v1 streaming). A speech gate cuts each participant's
 * audio into utterances; each utterance gets its own short stream, so silence
 * is never sent and streams never approach Google's time limit. Credentials
 * come from the environment (Application Default Credentials).
 */
export class GoogleSpeechRecognizer implements Recognizer {
  readonly sampleRate = SAMPLE_RATE;
  private readonly client = new speech.SpeechClient();
  private readonly request: StreamingRequest;

  constructor(model: string, private readonly log: (msg: string) => void = console.warn) {
    this.request = {
      config: {
        encoding: 'LINEAR16',
        sampleRateHertz: SAMPLE_RATE,
        languageCode: 'en-US',
        model,
        maxAlternatives: 1,
        profanityFilter: false,
        speechContexts: [{ phrases: [...COMMAND_PHRASES], boost: 20 }],
      },
      interimResults: false,
      singleUtterance: false,
    };
  }

  open(participantId: string, onFinal: (text: string) => void): RecognizerSession {
    let stream: ReturnType<typeof this.client.streamingRecognize> | null = null;
    const write = (pcm: Int16Array) => {
      if (stream && !stream.destroyed) stream.write(Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength));
    };
    const gate = new SpeechGate(
      { sampleRate: SAMPLE_RATE },
      {
        start: (preroll) => {
          const s = this.client.streamingRecognize(this.request);
          s.on('data', (res: { results?: { isFinal?: boolean; alternatives?: { transcript?: string }[] }[] }) => {
            for (const r of res.results ?? []) {
              const text = r.alternatives?.[0]?.transcript;
              if (r.isFinal && text) onFinal(text);
            }
          });
          s.on('error', (err: Error) => this.log(`[stt] ${participantId}: ${err.message}`));
          stream = s;
          preroll.forEach(write);
        },
        audio: write,
        end: () => {
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
}
