# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Roadies** is Discord-style, hands-free proximity voice chat for drivers stuck in the same jam, built as a hackathon demo on US-101 northbound. `DESIGN.md` is the source of truth for product decisions (every row of its §1 table was decided by the user); change the doc when you change a decision. `HANDOFF.md` has the current state and next steps.

## Commands

npm workspaces: `shared/`, `server/`, `web/`. Node 22+.

```sh
npm install
npm run dev              # local LiveKit (dev mode) + server :8080 + Vite :5173
npm run dev:app          # server + web only (when .env points at LiveKit Cloud)
npm run livekit          # just the local LiveKit server (downloads it on Linux and Windows/Git Bash; macOS: brew install livekit)
npm run fake-phones -- 12 [spot] [serverUrl]   # talking (beeping) fake phones via @livekit/rtc-node

npm test                 # Vitest: shared/test + server/test
npx vitest run shared/test/matchmaker.test.ts -t "caps rooms"   # one file / one test
npm run typecheck        # tsc per package (TypeScript 7, noEmit)
npm run e2e              # Playwright: real Chromium phones + local LiveKit + server
npx playwright test -g "lone commuter"                            # one e2e test
npm run build            # Vite build into web/dist (the server serves it)
```

- Playwright's `webServer` config **reuses** anything already on :7880/:8080. After changing server code, stop the running server first, or e2e tests run against stale code. The static web build is read from disk per request, so `npm run build` alone is picked up.
- On a laptop without the preinstalled browser, run `npx playwright install chromium` once (`playwright.config.ts` only uses `/opt/pw-browsers/chromium` if it exists; `CHROMIUM_PATH` overrides).
- Dev-only HTTP endpoints (off when `NODE_ENV=production`): `POST /dev/say {carId|name, text}` injects a transcript as if the listener heard it; `GET /dev/state` returns the snapshot plus which mics the listener receives; `POST /dev/reset` resets the world.
- Config is environment only (`server/src/config.ts`); `.env` at the repo root is loaded by the server scripts (`tsx --env-file-if-exists=../.env`). See `.env.example`.

## Architecture

**Server is the authority.** Phones keep one WebSocket (`/ws`) for control and a LiveKit connection for audio. Room assignment and voice state (`selfMute`, `selfDeaf`, `connected`) live only on the server; phones apply what the server sends. Button presses and spoken commands go through the same path: `World.command()` → `applyCommand()` → `{t:'state'}` message → `VoiceClient.apply()` on the phone.

**Pure core, thin I/O.** `shared/src/matchmaker.ts` (proximity rooms) and `shared/src/voice.ts` (Discord state rules and the whole-utterance command parser) are pure and take `now` explicitly. `server/src/world.ts` owns cars, rooms and messaging but does no network I/O: sockets are injected as `send` callbacks and LiveKit token issuing is injected, so `server/test/world.test.ts` drives it with a fake clock. `server/src/hub.ts` (WebSocket), `listener.ts` (LiveKit) and `index.ts` (Express) are the I/O shell.

**Mute is not a muted track (key invariant).** The phone always publishes its mic, because a hidden server participant (`roadies-listener`, `server/src/listener.ts`, one per room, via `@livekit/rtc-node`) must keep hearing "unmute" and "connect". Muting sets LiveKit track-subscription permissions so only the listener identity may subscribe (`web/src/lib/voice.ts`). Deafen unsubscribes from remote audio. Disconnect leaves the driver in the LiveKit room as a "ghost" (inactive in the matchmaker, hidden from rosters, still heard by the listener). Never "mute" by disabling the mic track, or voice commands stop working.

**Command recognition** (`server/src/recognizer/`): the listener pipes each participant's 16 kHz audio into a `Recognizer`. `GoogleSpeechRecognizer` runs a `SpeechGate` (energy VAD) and opens one short Google streaming request per utterance; each final transcript goes to `World.transcript()` → `parseAlternatives()`, which only accepts an utterance that is exactly a command (aliases in `PHRASES` in `shared/src/voice.ts`, also used as STT phrase hints). `FakeRecognizer` (the dev default) hears nothing; use `/dev/say`.

**Languages** (en/fr/es/vi, `shared/src/lang.ts`): the phone sends `lang` in `hello`; `World` keeps it on the car (`langOf`) and parses that car's transcripts with its language's `PHRASES` plus the English ones (accents folded by `normalizeUtterance`). The listener opens each recognizer session in the car's language (injected `langOf` lookup; `GoogleSpeechRecognizer` caches one request config per language). `RecognizerSessions` (`server/src/recognizer/sessions.ts`) keys sessions by LiveKit track, because a reload (e.g. after a language change) brings the same identity back with a new track before the old one's unsubscribe. Adding a command means one line per language in `PHRASES`. Phone strings live in `web/src/lib/i18n.ts` (typed against English; the UI shows `sayPhrase(lang, cmd)` so it always matches the parser); the presenter and `/sounds` stay English. `stt-check --lang fr` checks recordings in another language.

**Matchmaking rules** (DESIGN.md §3; changed 2026-09-26 by the owner): join the closest non-full room with an *active member*, at any distance (the old 5 km cap is gone), otherwise open a room; a room down to one active member for 15 s gets merged into the closest open room at any distance (unchanged); rooms are sticky (no re-matching on drift); capacity 4 counts active members only. `connect` (while disconnected) re-matches to the closest active driver with a free seat right now, using the same `closestOpen` lookup as joining — reactivating in place if that's your own ghost room. `random` (while disconnected only; ignored while connected) jumps to a uniformly random other open room, or falls back to exactly what `connect` does when there's none (it always works). While disconnected, the server also pushes a `{t:'closest', match}` preview so the phone can show what `connect` would do; it carries data only (name/color/room name), never English sentences, so the phone composes the text — this and `{t:'notice', code}` keep the protocol i18n-ready. Matchmaker room ids are the LiveKit room names; the listener joins on `room-created` and leaves on `room-deleted`. When a car moves rooms the server sends a fresh `assigned` message with a new token and the phone switches LiveKit rooms, reusing its mic track.

**Demo world**: `shared/src/corridor.ts` holds US-101 NB geometry (OSM via OSRM, simplified) with positions in km along the route, the named `LANDMARKS` used for room names, and `JAMS`. Unit tests enforce that jams stay more than 5.5 km apart and that every loner spot has a real place name; keep them passing if you move jams. `server/src/demo.ts` scripts where demo joiners go (first 6 to Hospital Curve, overfilling its 4-seat capacity so a second room opens; then a cycle including lone commuters) and moves cars in stop-and-go, capped at their jam head.

**Protocol**: every message type is in `shared/src/protocol.ts`; change both sides together. The `shared` package is consumed as TypeScript source (its `exports` points at `src/index.ts`); there is no build step for it.

**Web** (`web/src`, React + Vite, path-based routing in `main.tsx`): `/demo` (random car, `?spot=` override), `/` → **Your jam** (`Join.tsx`, normal mode, real GPS; auto-assigns a random car via `ensureProfile()` on first-ever open instead of forcing `/setup`), `/setup` (reachable any time from Your jam's gear icon), `/presenter?key=` (projector: lazy-loaded so Leaflet/QR never ship to phones), `/sounds` (unlinked page to audition the sounds), `/brand` (unlinked dev preview of the brand kit: intro, logo, wordmark, car colors, type). The sounds are Discord's own mp3s in `web/public/audio/`, played by `lib/chimes.ts`. `DriveSession` (`lib/session.ts`) glues the socket, `VoiceClient` and chimes, and is exposed as `window.__roadies` for e2e tests. There is deliberately no `StrictMode`: its dev double-mount tears down the live voice session. Car identity is per browser tab (`sessionStorage`), so several tabs act as several cars. The projector uses Esri's dark canvas tiles because CARTO's dark tiles now require an API key.

**Flow / restyle** (2026-09-26, DESIGN.md's Flow row): every open of `Join.tsx` plays the girlfriend's intro (`intro/Intro.tsx`; tap skips, `prefers-reduced-motion` skips outright) before showing **Your jam** — her wordmark, a jam card (real live "drivers talking" count, never fake data), and two big `connect`/`random` cards whose first tap unlocks audio+mic and sends the first `hello` (optionally `join:'random'`, `shared/src/protocol.ts` + `shared/src/matchmaker.ts`'s `placeRandom`). `Join.tsx` is the controller and routes by state: intro (once per mount) → Settings in place (`nav==='settings'`) → `Drive.tsx` (voice chat, connected only: Live tag, room name, up to 4 round avatars with a speaking ring and muted badge, her control bar) → `YourJam.tsx` otherwise. `disconnect` lands on Your jam, whose cards then preview the server's `closest`. History entries (`{roadies:'call'|'settings'}`) make browser/Android back close Settings or send `disconnect` from a call. Renaming in Settings mid-session re-sends `hello` (`DriveSession.updateIdentity`). No "Heard …" pop-up (owner, 2026-09-26). `main.tsx` wraps phone routes in `.phone-shell`/`.phone`, a phone frame on desktop. Dark mode follows the OS setting on every phone screen (`web/src/styles.css`'s `:root` tokens + `@media (prefers-color-scheme: dark)`); `.presenter` pins its own tokens so the projector stays dark regardless.

## Deployment

At most one Cloud Run instance (`Dockerfile`; `--min-instances 0 --max-instances 1 --cpu-throttling`). All state is in memory, so never scale past one instance. It scales to zero once nobody is connected, which wipes that state; open `/ws` sockets keep it alive, with CPU allocated, for the whole session. In production, `RECOGNIZER` defaults to `google` (Application Default Credentials; the runtime service account needs `roles/speech.client`), `/dev/*` is off, and a missing `PRESENTER_KEY` gets a random key printed at startup. Full commands are in docs/deploy.md.

Mobile browsers pause WebRTC when the page is backgrounded (e.g. behind Google Maps), so the phone keeps a screen wake lock. Background voice needs a native shell (roadmap, DESIGN.md §12).
