/** Shape of public/gen/captures/<take>/events.json, written by tools/capture.ts. */
export interface CaptureEvent {
  /** Epoch ms. */
  t: number;
  kind: string;
  [key: string]: unknown;
}

export interface CapturedVideo {
  /** Relative to public/, for staticFile(). */
  file: string;
  /** Epoch ms of the video's first frame (video time 0). */
  t0: number;
  frames: number;
  width: number;
  height: number;
}

export interface CaptureLog {
  take: string;
  videos: { presenter: CapturedVideo; hero: CapturedVideo };
  lines: string[];
  events: CaptureEvent[];
}
