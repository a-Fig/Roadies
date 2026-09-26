import type { Lang } from '@roadies/shared';
import { describe, expect, it } from 'vitest';
import { RecognizerSessions } from '../src/recognizer/sessions';
import { SAMPLE_RATE, type Recognizer } from '../src/recognizer/types';

/** A recognizer that records every session it opens. */
function setup(langs: Record<string, Lang> = {}) {
  const opened: { id: string; lang: Lang; samples: number; closed: boolean; hear: (text: string) => void }[] = [];
  const recognizer: Recognizer = {
    sampleRate: SAMPLE_RATE,
    open(id, lang, onFinal) {
      const s = { id, lang, samples: 0, closed: false, hear: (text: string) => onFinal([text]) };
      opened.push(s);
      return {
        write: (pcm) => void (s.samples += pcm.length),
        close: () => void (s.closed = true),
      };
    },
  };
  const heard: [string, string][] = [];
  const sessions = new RecognizerSessions(
    recognizer,
    (id) => langs[id] ?? 'en',
    (id, alts) => heard.push([id, alts[0]!]),
  );
  const open = () => opened.filter((s) => !s.closed).map((s) => `${s.id}:${s.lang}`);
  return { sessions, opened, open, heard, langs };
}

const pcm = new Int16Array(160);

describe('RecognizerSessions', () => {
  it('opens one session per participant in their language and routes finals by participant', () => {
    const t = setup({ alice: 'fr' });
    t.sessions.open('alice', 'TR_a');
    t.sessions.open('bob', 'TR_b');
    expect(t.open()).toEqual(['alice:fr', 'bob:en']);
    expect(t.sessions.ids()).toEqual(['alice', 'bob']);
    t.opened[0]!.hear('coupe le micro');
    expect(t.heard).toEqual([['alice', 'coupe le micro']]);
  });

  it('reopens the session in the new language after a language change', () => {
    const t = setup({ alice: 'en' });
    t.sessions.open('alice', 'TR_a');
    t.langs.alice = 'vi';
    t.sessions.refresh('alice');
    expect(t.open()).toEqual(['alice:vi']);
    // Still fed by the same track.
    expect(t.sessions.write('alice', 'TR_a', pcm)).toBe(true);
    expect(t.opened.at(-1)!.samples).toBe(160);
  });

  it('leaves the session alone when the language did not change, and ignores unknown participants', () => {
    const t = setup({ alice: 'es' });
    t.sessions.open('alice', 'TR_a');
    t.sessions.refresh('alice');
    t.sessions.refresh('nobody');
    expect(t.opened).toHaveLength(1);
    expect(t.open()).toEqual(['alice:es']);
  });

  it('after a reload, the new track wins even if the old track ends later', () => {
    // Settings change -> reload -> new hello (lang now fr) -> new LiveKit
    // connection with the same identity. The new track can be subscribed
    // before the old one is unsubscribed.
    const t = setup({ alice: 'en' });
    t.sessions.open('alice', 'TR_old');
    t.langs.alice = 'fr';
    t.sessions.open('alice', 'TR_new');
    expect(t.open()).toEqual(['alice:fr']);

    // The old track's last frames and its unsubscribe must not touch the new session.
    expect(t.sessions.write('alice', 'TR_old', pcm)).toBe(false);
    t.sessions.close('alice', 'TR_old');
    expect(t.open()).toEqual(['alice:fr']);
    expect(t.sessions.write('alice', 'TR_new', pcm)).toBe(true);

    t.sessions.close('alice', 'TR_new');
    expect(t.open()).toEqual([]);
    expect(t.sessions.ids()).toEqual([]);
  });

  it('closeAll ends every session', () => {
    const t = setup();
    t.sessions.open('alice', 'TR_a');
    t.sessions.open('bob', 'TR_b');
    t.sessions.closeAll();
    expect(t.open()).toEqual([]);
    expect(t.sessions.write('bob', 'TR_b', pcm)).toBe(false);
  });
});
