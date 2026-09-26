import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const env = process.env;
const production = env.NODE_ENV === 'production';

export type RecognizerKind = 'google' | 'fake';

export const config = {
  port: Number(env.PORT ?? 8080),
  production,
  livekit: {
    /** Where this server reaches LiveKit (the listener connects here). */
    url: env.LIVEKIT_URL ?? 'ws://localhost:7880',
    /** Where phones reach LiveKit. Defaults to LIVEKIT_URL. */
    publicUrl: env.PUBLIC_LIVEKIT_URL ?? env.LIVEKIT_URL ?? 'ws://localhost:7880',
    // `livekit-server --dev` uses devkey / secret.
    apiKey: env.LIVEKIT_API_KEY ?? 'devkey',
    apiSecret: env.LIVEKIT_API_SECRET ?? 'secret',
  },
  /** Never fall back to a guessable key in production. */
  presenterKey: env.PRESENTER_KEY ?? (production ? randomUUID().slice(0, 8) : 'demo'),
  /** 'google' needs Google Cloud credentials; 'fake' only hears /dev/say. */
  recognizer: (env.RECOGNIZER ?? (production ? 'google' : 'fake')) as RecognizerKind,
  googleSttModel: env.GOOGLE_STT_MODEL ?? 'command_and_search',
  /** Join rooms with the hidden command listener. */
  listener: env.LISTENER !== 'off',
  /** Enables /dev/* endpoints (inject transcripts, inspect state). */
  devEndpoints: env.DEV_ENDPOINTS ? env.DEV_ENDPOINTS === '1' : !production,
  logTranscripts: env.LOG_TRANSCRIPTS === '1',
  /** Save every utterance the speech gate cuts as a WAV in this directory, for tuning. Never in production. */
  saveUtterances: production ? null : env.SAVE_UTTERANCES || null,
  webDist: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist'),
};

export const LISTENER_IDENTITY = 'roadies-listener';
