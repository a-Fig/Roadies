# Handoff: Roadies laptop session

**For the next Claude Code session, running locally on the owner's laptop.**
Focus: real integrations and the demo. Set up LiveKit Cloud and Google
Speech-to-Text, test on real phones, tune voice-command recognition, deploy to
Cloud Run, rehearse.

## Read first

- `CLAUDE.md`: commands, architecture and the key invariants.
- `DESIGN.md`: every product decision (the §1 table). The owner made these in
  a kickoff interview; don't re-open them unless something in this session
  forces it, and then ask.
- `README.md`: run and test; `docs/deploy.md`: real phones, CI and deploy.
- History: [PR #1](https://github.com/a-Fig/Roadies/pull/1), merged into `main`.

## Working with the owner

The owner (GitHub `a-Fig`) is the boss and has final say. Think answers
through before replying. Use the multiple-choice question tool for decisions
and questions, and give a recommendation with each. The hackathon demo is
within 48 hours of 2026-09-26, so finish everything and cut only if time
runs out (build order in DESIGN.md §10).

## State at handoff

Built and verified in a cloud container (no real accounts, no real phones):

- 68 unit tests and 9 Playwright end-to-end tests pass. The e2e tests use real
  Chromium phones with fake mics, a local `livekit-server --dev`, and the real
  server. They prove at the media level that mute, deafen and disconnect cut
  audio to the room while the hidden listener still receives it; that the lone
  merge happens at 15 s; and that the projector and normal mode (setup + GPS)
  work.
- A fake-phones run (18 phones through the scripted placement) rendered the
  projector correctly with Esri tiles.
- The production path (`npm ci` → build → `npm prune --omit=dev` →
  `NODE_ENV=production npm start`) boots in a clean copy.

Never exercised, so expect work here:

1. **Google Speech-to-Text** (`server/src/recognizer/google.ts`) has never
   received real audio. The request shape was taken from the installed
   `@google-cloud/speech` v8 types.
2. **`SpeechGate`** (`server/src/recognizer/gate.ts`) is tuned only on
   synthetic tones. Real speech through browser noise suppression and
   automatic gain will need threshold tuning.
3. **Real phones**: iOS Safari and Android Chrome mic permission, the
   "Tap to turn on sound" autoplay fallback, chimes, wake lock, and echo with
   several live phones in one physical room. The owner chose "join live".
4. **Docker build and Cloud Run deploy**: never run (no Docker daemon in the
   container).

## Plan for this session

1. **Local smoke test.** `npm install`, `brew install livekit`,
   `npx playwright install chromium`, then `npm test` and `npm run e2e`.
   Then `npm run dev` and open `http://localhost:5173/presenter?key=demo`
   plus a few `/demo` tabs. Desktop Chrome on localhost can use the real mic.
2. **Google STT.** `gcloud services enable speech.googleapis.com`,
   `gcloud auth application-default login`, then
   `gcloud auth application-default set-quota-project <project>`. In `.env`
   set `RECOGNIZER=google` and `LOG_TRANSCRIPTS=1`. Speak each command in a
   desktop tab and read the `[stt]` log lines.
   - Nothing is transcribed: the gate isn't opening. Lower `minRms` or
     `floorRatio`, or check that `onsetMs` and `warmupMs` aren't swallowing
     short words.
   - Commands are misheard: add aliases to `PHRASES` in `shared/src/voice.ts`
     (they double as Google phrase hints). Try `GOOGLE_STT_MODEL`
     `latest_short` or `default` against `command_and_search`.
   - Keep the whole-utterance rule: "don't mute me" must never trigger. The
     unit tests in `shared/test/voice.test.ts` cover it.
3. **LiveKit Cloud.** Create a project and set `LIVEKIT_URL`,
   `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` in `.env`. Run `npm run dev:app`
   (no local LiveKit). Check that `npm run fake-phones -- 3 sfo` shows up on
   the projector.
4. **Real phones.** Run `cloudflared tunnel --url http://localhost:5173` (or
   ngrok) and open `<tunnel>/demo` on an iPhone and an Android phone. Check
   join, hearing each other, spoken commands, chimes, and the screen staying
   on. Note: over a tunnel the `/dev/*` endpoints are public, which is fine
   for rehearsal but not for the real demo.
5. **Deploy.** Follow docs/deploy.md "Deploy". Keep exactly one instance. Set
   `PRESENTER_KEY`. Check `/health`, `/presenter?key=…`, and that the QR code
   points at the deployed `/demo` (use `?join=` to override it).
6. **Rehearse** against the deployed URL:
   `npm run fake-phones -- 12 "" https://<service-url>` fills the rooms. Walk
   the pitch: scan in, say "unmute" and "mute", watch Hospital Curve overflow
   into #2, press `L` for a lone commuter and watch the 15 s merge, press `M`
   (mute everyone) if the room feeds back. Have a phone hotspot as a Wi-Fi
   backup.

## Gotchas already paid for

- Playwright reuses a server already running on :8080. Restart it after
  server changes, or the tests run stale code.
- `pkill -f "<pattern>"` can match the shell running it and kill your own
  command. Use a bracket pattern (`pkill -f "[f]ake-phones"`) or
  `lsof -i :8080 -t | xargs kill`.
- The first `npm install -w <new-workspace> <pkgs>` into a brand-new workspace
  silently recorded nothing. Re-run it and check that the package.json changed.
- CARTO basemaps now return "API KEY REQUIRED" tiles, so the projector uses
  Esri's dark canvas.

## Suggested skills

- `run`: launch and drive the app to check a change for real.
- `code-review` (and `security-review` before the public deploy): review
  diffs before pushing.
