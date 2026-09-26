import { WS_PATH } from '@roadies/shared';

export type SocketStatus = 'connecting' | 'open' | 'closed';

export interface SocketHandlers<In> {
  onOpen?: () => void;
  onMessage: (msg: In) => void;
  onStatus?: (status: SocketStatus) => void;
  /** Close code that means "stop retrying" (e.g. wrong presenter key). */
  onRejected?: (reason: string) => void;
}

/** A WebSocket to the Roadies server that reconnects with backoff. */
export class RoadiesSocket<In, Out> {
  private ws: WebSocket | null = null;
  private stopped = false;
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly handlers: SocketHandlers<In>,
    private readonly query = '',
  ) {}

  start(): void {
    this.stopped = false;
    this.connect();
  }

  send(msg: Out): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.ws?.close();
    this.ws = null;
  }

  private connect(): void {
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${scheme}://${location.host}${WS_PATH}${this.query}`);
    this.ws = ws;
    this.handlers.onStatus?.('connecting');
    ws.onopen = () => {
      this.attempt = 0;
      this.handlers.onStatus?.('open');
      this.handlers.onOpen?.();
    };
    ws.onmessage = (e) => {
      try {
        this.handlers.onMessage(JSON.parse(String(e.data)) as In);
      } catch (err) {
        console.error('Bad message from server', err);
      }
    };
    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      this.handlers.onStatus?.('closed');
      if (e.code >= 4000 && e.code < 5000) {
        this.handlers.onRejected?.(e.reason);
        return;
      }
      if (this.stopped) return;
      const delay = Math.min(5000, 500 * 2 ** this.attempt++);
      this.timer = setTimeout(() => this.connect(), delay);
    };
  }
}
