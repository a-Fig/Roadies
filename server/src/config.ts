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
  presenterKey: env.PRESENTER_KEY ?? 'demo',
  /** 'google' needs Google Cloud credentials; 'fake' only hears /dev/say. */
  recognizer: (env.RECOGNIZER ?? (production ? 'google' : 'fake')) as RecognizerKind,
  googleSttModel: env.GOOGLE_STT_MODEL ?? 'command_and_search',
  /** Join rooms with the hidden command listener. */
  listener: env.LISTENER !== 'off',
  /** Enables /dev/* endpoints (inject transcripts, inspect state). */
  devEndpoints: env.DEV_ENDPOINTS ? env.DEV_ENDPOINTS === '1' : !production,
  logTranscripts: env.LOG_TRANSCRIPTS === '1',
  webDist: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist'),
};

export const LISTENER_IDENTITY = 'roadies-listener';
