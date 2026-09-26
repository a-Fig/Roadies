import { chimes, CHIME_NAMES, unlockAudio } from '../lib/chimes';

/** Audition page for the earcons: tap each one on a phone. Not linked from the app. */
export function Sounds() {
  return (
    <main className="setup">
      <h1>Sounds</h1>
      <p className="car-sub">Tap to hear each one. On iPhone, turn off silent mode first.</p>
      <div className="chips">
        {CHIME_NAMES.map((name) => (
          <button
            key={name}
            className="chip"
            onClick={() => {
              unlockAudio();
              chimes[name]();
            }}
          >
            {name}
          </button>
        ))}
      </div>
    </main>
  );
}
