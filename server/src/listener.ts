import { AudioStream, Room, RoomEvent, TrackKind, type RemoteParticipant, type RemoteTrack } from '@livekit/rtc-node';
import type { Recognizer, RecognizerSession, UtteranceInfo } from './recognizer/types';

export interface ListenerOptions {
  url: string;
  identity: string;
  issueToken: (identity: string, name: string, room: string, opts: { hidden: boolean }) => Promise<string>;
  recognizer: Recognizer;
  onTranscript: (participantId: string, text: string, info?: UtteranceInfo) => void;
  onSpeakers: (roomId: string, identities: string[]) => void;
  log?: (msg: string) => void;
}

interface Joined {
  room: Room;
  sessions: Map<string, RecognizerSession>;
}

/**
 * A hidden participant in every Roadies room. It subscribes to everyone's mic,
 * including muted drivers (who allow only this identity), and feeds the audio
 * to the recognizer so spoken commands work hands-free.
 */
export class ListenerManager {
  private readonly rooms = new Map<string, Joined | 'joining'>();
  private readonly log: (msg: string) => void;

  constructor(private readonly o: ListenerOptions) {
    this.log = o.log ?? ((m) => console.log(m));
  }

  get roomIds(): string[] {
    return [...this.rooms.keys()];
  }

  /** Participants whose audio the listener is currently receiving, per room. */
  subscriptions(): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const [id, j] of this.rooms) if (j !== 'joining') out[id] = [...j.sessions.keys()];
    return out;
  }

  async join(roomId: string): Promise<void> {
    if (this.rooms.has(roomId)) return;
    this.rooms.set(roomId, 'joining');
    const room = new Room();
    const joined: Joined = { room, sessions: new Map() };

    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub, participant: RemoteParticipant) => {
      if (track.kind !== TrackKind.KIND_AUDIO) return;
      void this.consume(joined, participant.identity, track);
    });
    room.on(RoomEvent.TrackUnsubscribed, (_track, _pub, participant: RemoteParticipant) => {
      this.closeSession(joined, participant.identity);
    });
    room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
      this.closeSession(joined, participant.identity);
    });
    room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      this.o.onSpeakers(roomId, speakers.map((p) => p.identity));
    });

    try {
      const token = await this.o.issueToken(this.o.identity, 'Roadies listener', roomId, { hidden: true });
      await room.connect(this.o.url, token, { autoSubscribe: true, dynacast: false });
      if (this.rooms.get(roomId) !== 'joining') {
        // The room was deleted while we were connecting.
        await room.disconnect();
        return;
      }
      this.rooms.set(roomId, joined);
      this.log(`[listener] joined ${roomId}`);
    } catch (err) {
      this.rooms.delete(roomId);
      this.log(`[listener] could not join ${roomId}: ${(err as Error).message}`);
    }
  }

  async leave(roomId: string): Promise<void> {
    const joined = this.rooms.get(roomId);
    this.rooms.delete(roomId);
    if (!joined || joined === 'joining') return;
    for (const id of [...joined.sessions.keys()]) this.closeSession(joined, id);
    await joined.room.disconnect();
    this.log(`[listener] left ${roomId}`);
  }

  async close(): Promise<void> {
    await Promise.all(this.roomIds.map((id) => this.leave(id)));
  }

  private async consume(joined: Joined, identity: string, track: RemoteTrack): Promise<void> {
    this.closeSession(joined, identity);
    const session = this.o.recognizer.open(identity, (text, info) => this.o.onTranscript(identity, text, info));
    joined.sessions.set(identity, session);
    const stream = new AudioStream(track, { sampleRate: this.o.recognizer.sampleRate, numChannels: 1 });
    try {
      for await (const frame of stream) {
        if (joined.sessions.get(identity) !== session) break;
        session.write(frame.data);
      }
    } catch (err) {
      this.log(`[listener] audio stream for ${identity} ended: ${(err as Error).message}`);
    } finally {
      if (joined.sessions.get(identity) === session) this.closeSession(joined, identity);
    }
  }

  private closeSession(joined: Joined, identity: string): void {
    const session = joined.sessions.get(identity);
    if (!session) return;
    joined.sessions.delete(identity);
    session.close();
  }
}
