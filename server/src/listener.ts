import { AudioStream, Room, RoomEvent, TrackKind, type RemoteParticipant, type RemoteTrack, type RemoteTrackPublication } from '@livekit/rtc-node';
import type { Lang } from '@roadies/shared';
import { RecognizerSessions } from './recognizer/sessions';
import type { Recognizer, UtteranceInfo } from './recognizer/types';

export interface ListenerOptions {
  url: string;
  identity: string;
  issueToken: (identity: string, name: string, room: string, opts: { hidden: boolean }) => Promise<string>;
  recognizer: Recognizer;
  /** The language to hear a participant (a car id) in. */
  langOf: (participantId: string) => Lang;
  /** `heard` is the n-best list for one utterance, best guess first. */
  onTranscript: (participantId: string, heard: readonly string[], info?: UtteranceInfo) => void;
  onSpeakers: (roomId: string, identities: string[]) => void;
  log?: (msg: string) => void;
}

interface Joined {
  room: Room;
  sessions: RecognizerSessions;
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
    for (const [id, j] of this.rooms) if (j !== 'joining') out[id] = j.sessions.ids();
    return out;
  }

  /** A participant's language may have changed: hear them in the new one. */
  refresh(participantId: string): void {
    for (const j of this.rooms.values()) if (j !== 'joining') j.sessions.refresh(participantId);
  }

  async join(roomId: string): Promise<void> {
    if (this.rooms.has(roomId)) return;
    this.rooms.set(roomId, 'joining');
    const room = new Room();
    const joined: Joined = {
      room,
      sessions: new RecognizerSessions(this.o.recognizer, this.o.langOf, this.o.onTranscript),
    };

    room.on(
      RoomEvent.TrackSubscribed,
      (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
        if (track.kind !== TrackKind.KIND_AUDIO) return;
        void this.consume(joined, participant.identity, publication.sid ?? '', track);
      },
    );
    room.on(
      RoomEvent.TrackUnsubscribed,
      (_track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
        joined.sessions.close(participant.identity, publication.sid ?? '');
      },
    );
    room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
      // Only this participant's tracks: after a reload, the same identity may
      // already be back with a new track.
      for (const trackId of participant.trackPublications.keys()) joined.sessions.close(participant.identity, trackId);
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
    joined.sessions.closeAll();
    await joined.room.disconnect();
    this.log(`[listener] left ${roomId}`);
  }

  async close(): Promise<void> {
    await Promise.all(this.roomIds.map((id) => this.leave(id)));
  }

  private async consume(joined: Joined, identity: string, trackId: string, track: RemoteTrack): Promise<void> {
    joined.sessions.open(identity, trackId);
    try {
      // Inside the try: a track that is already gone makes rtc-node throw right here
      // ("handle is not a livekit_ffi::server::room::FfiTrack"), and that rejection,
      // unhandled, used to take the whole server down.
      const stream = new AudioStream(track, { sampleRate: this.o.recognizer.sampleRate, numChannels: 1 });
      for await (const frame of stream) {
        if (!joined.sessions.write(identity, trackId, frame.data)) break;
      }
    } catch (err) {
      this.log(`[listener] audio stream for ${identity} ended: ${(err as Error).message}`);
    } finally {
      joined.sessions.close(identity, trackId);
    }
  }
}
