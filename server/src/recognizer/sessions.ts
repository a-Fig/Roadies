import type { Lang } from '@roadies/shared';
import type { Recognizer, RecognizerSession, UtteranceInfo } from './types';

interface Entry {
  /** The LiveKit track feeding this session. */
  trackId: string;
  lang: Lang;
  session: RecognizerSession;
}

/**
 * The listener's recognizer sessions in one room: one per participant, fed by
 * that participant's current audio track, in that participant's language.
 * Kept free of LiveKit so the handoffs are unit-tested:
 *
 * - A reload rejoins with the same identity, so a new track can arrive before
 *   the old one's unsubscribe. Only the current track may write to or close
 *   the session.
 * - A driver who changes language says hello again; `refresh` reopens their
 *   session in the new language on the same track.
 */
export class RecognizerSessions {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly recognizer: Recognizer,
    private readonly langOf: (participantId: string) => Lang,
    private readonly onFinal: (participantId: string, heard: readonly string[], info?: UtteranceInfo) => void,
  ) {}

  /** Participants with an open session. */
  ids(): string[] {
    return [...this.entries.keys()];
  }

  /** A participant's (new) audio track: it replaces any older one. */
  open(participantId: string, trackId: string): void {
    this.close(participantId);
    this.entries.set(participantId, { trackId, ...this.start(participantId) });
  }

  /** Audio from a track. False once that track is no longer the participant's current one. */
  write(participantId: string, trackId: string, pcm: Int16Array): boolean {
    const entry = this.entries.get(participantId);
    if (entry?.trackId !== trackId) return false;
    entry.session.write(pcm);
    return true;
  }

  /** The track ended. Without a track id, closes whatever the participant has. */
  close(participantId: string, trackId?: string): void {
    const entry = this.entries.get(participantId);
    if (!entry || (trackId !== undefined && entry.trackId !== trackId)) return;
    this.entries.delete(participantId);
    entry.session.close();
  }

  /** Reopen the participant's session if their language changed. */
  refresh(participantId: string): void {
    const entry = this.entries.get(participantId);
    if (!entry || entry.lang === this.langOf(participantId)) return;
    entry.session.close();
    Object.assign(entry, this.start(participantId));
  }

  closeAll(): void {
    for (const id of this.ids()) this.close(id);
  }

  private start(participantId: string): { lang: Lang; session: RecognizerSession } {
    const lang = this.langOf(participantId);
    const session = this.recognizer.open(participantId, lang, (heard, info) => this.onFinal(participantId, heard, info));
    return { lang, session };
  }
}
