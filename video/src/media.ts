/** Shape of src/media.json, written by tools/voices.ts. */
export interface Word {
  text: string;
  /** Seconds from the start of the clip. */
  start: number;
  end: number;
}

export interface VoiceMedia {
  hash: string;
  /** The line as spoken, without delivery tags. */
  spoken: string;
  duration: number;
  words: Word[];
}

export interface Media {
  voices: Record<string, VoiceMedia>;
  sfx: Record<string, { hash: string; duration: number }>;
}
