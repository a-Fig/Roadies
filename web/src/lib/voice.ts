import {
  INITIAL_VOICE_STATE,
  isHearing,
  isTransmitting,
  type LiveKitAccess,
  type VoiceState,
} from '@roadies/shared';
import {
  ConnectionState,
  createLocalAudioTrack,
  Room,
  RoomEvent,
  Track,
  type LocalAudioTrack,
  type Participant,
  type RemoteTrackPublication,
} from 'livekit-client';

/**
 * The phone's side of a voice room.
 *
 * The mic is always published, because the server's hidden listener must hear
 * "unmute" and "connect". Muting is done with subscription permissions: while
 * you are not transmitting, only the listener may subscribe to your mic.
 * Deafening unsubscribes from everyone else's audio.
 */
export class VoiceClient {
  onSpeakers: (identities: string[]) => void = () => {};
  onConnection: (state: ConnectionState) => void = () => {};
  onAudioBlocked: (blocked: boolean) => void = () => {};

  private room: Room | null = null;
  private roomId: string | null = null;
  private mic: LocalAudioTrack | null = null;
  private listenerIdentity = '';
  private state: VoiceState = INITIAL_VOICE_STATE;
  private readonly audioHost: HTMLDivElement;

  constructor() {
    this.audioHost = document.createElement('div');
    this.audioHost.hidden = true;
    document.body.append(this.audioHost);
  }

  /** Ask for the mic. Call from a tap so the permission prompt is allowed. */
  async prepareMic(): Promise<void> {
    this.mic ??= await createLocalAudioTrack({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    });
  }

  /** Join (or switch to) a room. Re-joining the current room just applies state. */
  async join(roomId: string, access: LiveKitAccess, state: VoiceState): Promise<void> {
    this.state = state;
    this.listenerIdentity = access.listenerIdentity;
    if (this.room && this.roomId === roomId) {
      this.apply(state);
      return;
    }
    await this.leave();
    const room = new Room({ adaptiveStream: false, dynacast: false, disconnectOnPageLeave: true });
    this.room = room;
    this.roomId = roomId;

    room
      .on(RoomEvent.TrackPublished, (pub) => this.sync(pub))
      .on(RoomEvent.ParticipantConnected, (p) => p.trackPublications.forEach((pub) => this.sync(pub)))
      .on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) this.audioHost.append(track.attach());
      })
      .on(RoomEvent.TrackUnsubscribed, (track) => track.detach().forEach((el) => el.remove()))
      .on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) =>
        this.onSpeakers(speakers.map((s) => s.identity)),
      )
      .on(RoomEvent.AudioPlaybackStatusChanged, () => this.onAudioBlocked(!room.canPlaybackAudio))
      .on(RoomEvent.ConnectionStateChanged, (s) => this.onConnection(s));

    try {
      await room.connect(access.url, access.token, { autoSubscribe: false });
    } catch (err) {
      if (this.room !== room) return; // cancelled by a newer join, not a failure
      throw err;
    }
    if (this.room !== room) {
      // Superseded by a newer join while connecting.
      await room.disconnect();
      return;
    }
    await this.prepareMic();
    await room.localParticipant.publishTrack(this.mic!, { source: Track.Source.Microphone });
    this.apply(this.state);
    this.onAudioBlocked(!room.canPlaybackAudio);
  }

  /** Apply mute / deafen / disconnect to LiveKit. */
  apply(state: VoiceState): void {
    this.state = state;
    const room = this.room;
    if (!room) return;
    const transmit = isTransmitting(state);
    room.localParticipant.setTrackSubscriptionPermissions(
      transmit,
      transmit ? [] : [{ participantIdentity: this.listenerIdentity, allowAll: true }],
    );
    room.remoteParticipants.forEach((p) => p.trackPublications.forEach((pub) => this.sync(pub)));
  }

  /** Resume playback after the browser blocked autoplay. Call from a tap. */
  async startAudio(): Promise<void> {
    await this.room?.startAudio();
  }

  async leave(): Promise<void> {
    const room = this.room;
    this.room = null;
    this.roomId = null;
    this.onSpeakers([]);
    if (room) {
      if (this.mic) await room.localParticipant.unpublishTrack(this.mic, false).catch(() => {});
      await room.disconnect(false);
    }
    this.audioHost.replaceChildren();
  }

  async close(): Promise<void> {
    await this.leave();
    this.mic?.stop();
    this.mic = null;
    this.audioHost.remove();
  }

  /** For tests and debugging. */
  debug() {
    const room = this.room;
    const audio = room
      ? [...room.remoteParticipants.values()].flatMap((p) =>
          [...p.trackPublications.values()].filter((pub) => pub.kind === Track.Kind.Audio),
        )
      : [];
    return {
      roomId: this.roomId,
      connection: room?.state ?? ConnectionState.Disconnected,
      remoteAudio: audio.length,
      subscribedAudio: audio.filter((pub) => pub.isSubscribed).length,
      publishing: !!room?.localParticipant.getTrackPublication(Track.Source.Microphone),
    };
  }

  private sync(pub: RemoteTrackPublication): void {
    if (pub.kind !== Track.Kind.Audio) return;
    const want = isHearing(this.state);
    if (pub.isDesired !== want) pub.setSubscribed(want);
  }
}
