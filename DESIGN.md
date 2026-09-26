# Roadies — Design

**Roadies** (repo: TrafficLive) is Discord-style proximity **voice** chat for
drivers stuck in the same jam.
Built as a **hackathon demo** (48-hour build) where judges scan a QR code and
become cars stuck on **US-101 northbound, South Bay → SF, 8:15 AM**.

This document records every decision made during the kickoff interview. If code
and this doc disagree, fix one of them.

---

## 1. Decisions at a glance

| Area | Decision |
| --- | --- |
| Goal | Hackathon demo, built in 48 hours. Robustness, scale, moderation and legal come later. |
| Demo format | Audience scans a QR code, opens a mobile **web app** (no install), and becomes a simulated car. |
| Demo venue | Judges come to our table a few at a time; the laptop screen is the projector. No filler bots: the scripted placement stays as is. |
| Communication | **Live voice only**, heavily modeled on Discord voice channels. No text chat. |
| Controls | Bare spoken commands: `mute`, `unmute`, `deafen`, `undeafen`, `disconnect`, `connect`, `random`. No wake word. Buttons mirror them. |
| Rooms | Max **4** people. Filled by proximity: always the closest room with a free seat. |
| Matchmaking | New car joins the closest active driver's room with a free seat, at **any distance** — else opens a new room. Alone ≥ 15 s → merged into the closest open room at any distance (unchanged). Sticky. **Changed 2026-09-26 by the owner** (dropped the old 5 km join cap; capacity 8 → 4). |
| Demo locations | Server assigns simulated spots on real 101 NB choke points; cars inch forward. Normal link uses real GPS. |
| Voice transport | **LiveKit** (Cloud in prod, `livekit-server --dev` locally). |
| Command recognition | **Server-side**: hidden listener joins each room, Google Speech-to-Text on each person's audio. |
| Hosting | Node + TypeScript server on **Google Cloud Run** (1 always-on instance, CPU always allocated). Laptop + tunnel as backup. |
| Join state | Normal mode joins **live** (unmuted), Discord default. Demo mode joins **muted** (you hear the room; say "unmute" to talk), because judges' phones share one table and open mics would feed back. Changed 2026-09-26 in the laptop session. |
| Phone UI | **Glanceable driving mode**: one huge status line, giant buttons, no member list. |
| Audio feedback | Discord-style **chimes** (original sounds synthesized with Web Audio). |
| After `disconnect` | Mic keeps listening for `connect` / `random` (screen shows a live preview of each). `connect` re-matches to the closest active driver with a free seat *right now*, same rule as joining — reactivates in place if that's your own (ghost) room. `random` jumps to a uniformly random open room other than your own; only works while disconnected. **Changed 2026-09-26 by the owner.** |
| Projector | Live map + Discord-style channel list + hidden presenter controls + QR code. |
| Identity | Demo: random car (e.g. "Teal Civic"). Normal: setup screen to pick car + name. No accounts. |
| Normal mode | Light but real: setup screen (saved on device) + real GPS matchmaking. |
| Look | ~90% Discord clone (dark grays, layout, rounded, channel list) with night-highway accents. |
| Scope policy | Build everything; cut only if we run out of time. |
| Git | Draft PR from `claude/project-kickoff-619smi` opened immediately. |
| Name | **Roadies**. |
| Background use | Web app for the hackathon (screen stays on via wake lock). Voice behind Google/Apple Maps needs a native shell: roadmap. |

---

## 2. Architecture

```
 phones (web app)                    projector (web app /presenter)
   │  livekit-client (voice)            │ ws (snapshots)
   │  ws (control: hello, commands)     │
   ▼                                    ▼
 ┌──────────────────────── Node server (Cloud Run, 1 instance) ────────────────────────┐
 │ Express: static web app, /api/*, /dev/* (dev only)                                   │
 │ WebSocket hub: client sessions + presenter feed                                      │
 │ Matchmaker (pure module): place / merge / capacity / naming                          │
 │ Voice state machine (pure module): Discord mute/deafen semantics                     │
 │ Demo simulator: assigns spots, inches cars forward, silent bot cars                  │
 │ Listener: @livekit/rtc-node joins each room as hidden participant                    │
 │   └─ Recognizer (interface) → GoogleSpeechRecognizer | FakeRecognizer (dev/tests)    │
 └────────────────────────────────────────┬─────────────────────────────────────────────┘
                                          │ server SDK (tokens, room API)
                                          ▼
                                   LiveKit (SFU)
```

- **Server is the authority** for room assignment and voice state. Spoken commands
  and button presses go through the *same* state machine; the server pushes the
  resulting state to the phone, which applies it to LiveKit.
- **State is in memory.** One instance, no database. Profiles live in the phone's
  `localStorage`.
- Repo layout (npm workspaces): `shared/` (types, protocol, pure logic),
  `server/`, `web/`.

### Stack
- TypeScript everywhere, Node 22.
- Web: React + Vite, `livekit-client`, Leaflet with Esri's dark canvas tiles for the
  projector map (CARTO's dark tiles now require an API key).
- Server: Express, `ws`, `livekit-server-sdk` (tokens + room API),
  `@livekit/rtc-node` (listener), `@google-cloud/speech`.
- Tests: Vitest (pure logic, server integration), Playwright with fake media +
  local LiveKit for end-to-end.

---

## 3. Matchmaking

Pure, unit-tested module in `shared/` (`Matchmaker`, `shared/src/matchmaker.ts`).

**Changed 2026-09-26 by the owner:** dropped the 5 km join cap (any distance now);
capacity 8 → 4; added `random` and the disconnected-screen preview.

- **Distance** = haversine distance from the newcomer (or the reconnecting/
  randomizing driver) to the **nearest active member** of a room (not the
  centroid), so you join whoever is actually closest.
- **Active** = connected (not ghosted by `disconnect`). Only active members count
  toward capacity and distance.
- **`closestOpen(memberId, pos)`**: the one pure lookup for "which room would you
  join right now" — the closest room with `< 4` active members and at least one
  active member other than yourself, at any distance, or `null` if none. Used by
  **both** `place` and `reconnect` (and the disconnected-screen preview below), so
  they can never disagree with each other.
- **Place (new car)**:
  1. `closestOpen(car, pos)`.
  2. If it found a room, join it (reason `closest`).
  3. Otherwise create a new room at the car's location (reason `new-room`).
- **Merge tick** (every second, unchanged): any room with exactly **1** active
  member for **≥ 15 s** has that member moved into the closest other open room at
  **any** distance (if one exists). Empty rooms are deleted.
- **Sticky**: no re-matching as you drive. You leave a room only by `disconnect`
  (then `connect` or `random`), by closing the app, or by the lone-merge rule.
- **`connect`** (re-match while disconnected): `closestOpen(car, car's current
  position)`.
  - If the match is your own ghost room, you **reactivate in place** — no LiveKit
    room switch, just an `active-changed` state update.
  - Otherwise you're removed from the old room and added to the target (reason
    `reconnect`), or a brand new room is opened if there's no match at all.
- **`random`** (only while disconnected — while connected it's ignored entirely:
  no state change, no log): picks uniformly at random, via the injected `rng`,
  among open rooms (≥ 1 active member, `< 4`) **other than** your current ghost
  room, and moves you there active (reason `random`; mute/deafen state is
  preserved). If there's no such room, you stay disconnected and the server sends
  `{t:'notice', code:'no-open-rooms'}`.
- **Disconnected-screen preview**: while disconnected, the server also computes
  `closestOpen` (excluding yourself) and whether `random` has anywhere to go, and
  pushes `{t:'closest', match, randomAvailable}` — sent on disconnect and again
  whenever either changes (checked every `World.tick()`). The phone composes the
  display text from this data; strings live together in the phone code so a
  separate i18n pass can translate them.
- **Room names**: nearest landmark on the corridor + ordinal, e.g.
  `Hospital Curve #2`. Outside the Bay Area landmark list: `Jam #n`.

## 4. Voice commands and state

Commands (whole utterance only — the transcript, normalized, must be exactly one
command; "don't mute me" does nothing):

`mute` · `unmute` · `deafen` · `undeafen` · `disconnect` · `connect` · `random`

State follows Discord semantics:

| Command | Effect |
| --- | --- |
| `mute` | selfMute = true |
| `unmute` | selfMute = false; if deafened, also undeafen (Discord behavior) |
| `deafen` | selfDeaf = true (mic is also cut while deafened) |
| `undeafen` | selfDeaf = false (mic returns to selfMute) |
| `disconnect` | leave the room (ghost), keep listening for `connect` / `random` |
| `connect` | re-match to the closest active driver with a free seat, right now (§3) |
| `random` | while disconnected only: jump to a random open room (ignored while connected) |

- *Transmitting* = connected ∧ ¬selfMute ∧ ¬selfDeaf.
- *Hearing* = connected ∧ ¬selfDeaf.

**How mute works with a server listener:** the phone never stops publishing its
mic track. "Muted" means the phone sets LiveKit **track subscription
permissions** so only the hidden listener may subscribe. That is what lets the
server still hear `unmute` / `connect`. Deafen = unsubscribe from all remote
audio. Disconnect = muted-to-everyone + deaf + removed from the room roster (a
"ghost" that still streams to the listener).

**Recognition:** the listener subscribes to every participant's audio and feeds
it to the `Recognizer`. Production uses Google Speech-to-Text streaming with the
six words boosted as phrase hints; streams are restarted before Google's
per-stream time limit. Aliases (e.g. "un mute") are normalized. Dev/tests use a
`FakeRecognizer` fed by `POST /dev/say`.

Privacy note for the pitch: audio reaches our server for command detection;
nothing is stored.

## 5. Demo mode

- QR on the projector → `https://<host>/demo`. One tap ("Join the jam") is
  required so the browser allows mic + audio playback.
- You join **muted**: you hear the room, the screen says `MUTED · say "unmute"`,
  and saying "unmute" is the first thing you do.
- Each joiner gets a random car identity and a **server-assigned spot**. The
  assignment is scripted so every rule shows up early on the projector:
  - the first wave (6 cars) fills **Hospital Curve** past capacity (4) → a
    second room opens;
  - later joiners spread across the other jams;
  - periodically a **lone commuter** spawns far south (Morgan Hill / Gilroy),
    sits alone, then gets merged after 15 s.
- Jams (all 101 NB, spaced > 5 km apart so they read as distinct places on the
  map — room assignment itself is by capacity only, at any distance):
  San Jose (101/880), Mountain View (101/85), Palo Alto, Redwood City,
  San Mateo (101/92), Millbrae / SFO, Hospital Curve (101/280 merge).
- Cars inch north along the real highway geometry at crawl speed.
- `?spot=<jam>` forces a spot (for scripted presenter/teammate phones).
- `connect` and `random` aren't part of the scripted table demo (no phone is
  ever disconnected on cue) — they're exercised in normal mode and by the e2e
  tests.

## 6. Normal mode

- `/` → setup screen: pick car make, color, display name → saved on device →
  "Start driving" → real GPS (`watchPosition`) → matchmaking.
- Same glanceable driving UI and voice commands as demo mode.

## 7. Phone UI (glanceable driving mode)

- One huge status line: room name + driver count, and who is talking now
  ("🟢 Teal Civic is talking").
- Whole screen tints **brake-light red** while muted/deafened, **go-green**
  accents while live, **amber** for warnings.
- Three giant buttons: Mute, Deafen, Disconnect/Connect (Discord red).
- Hint strip: `Say: mute · unmute · deafen · undeafen · disconnect`, flashing the
  last command heard. After disconnect: two tappable cards, one for `connect`
  and one for `random`, each showing the spoken command, a one-line
  description, and live context (who `connect` would match you with, or
  whether `random` has anywhere to go); tapping a card is the same as saying
  it (§3, §4).
- Audio: echo cancellation, noise suppression, auto gain on.
- Screen wake lock while in a room, so a mounted phone doesn't sleep. If the
  page is hidden anyway, show a "Keep Roadies on screen" notice on return.

## 8. Audio cues

Original Discord-like chimes synthesized in the browser: mute, unmute, deafen,
undeafen, disconnect, connect, someone joined, someone left.

## 9. Projector (`/presenter?key=…`)

- Dark Discord-style layout: channel list on the left
  (`🔊 Hospital Curve #1 — 4/4` with members and live speaking rings), map of the
  101 corridor on the right, QR code overlay.
- Cars = dots colored by room, pulsing green while talking; silent gray
  background traffic makes the jams look real.
- Hidden controls: reset demo, spawn a lone car (triggers a merge on cue),
  **mute everyone** (feedback panic button), server-mute a single car.

## 10. Build order

We intend to finish everything; this is dependency order, and the cut order only
if time runs out (cut from the bottom):

1. Matchmaking + LiveKit voice rooms + demo spots
2. Server-side voice commands (listener + recognizer)
3. Glanceable phone UI + chimes
4. Projector map + channel list
5. Presenter controls + background traffic
6. Normal-mode setup + real GPS

## 11. Laptop integration checklist (after moving the session)

- [ ] Create a LiveKit Cloud project → `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.
- [ ] GCP project: enable Speech-to-Text + Cloud Run; `gcloud auth`.
- [ ] Run locally against real LiveKit + Google STT; tune command recognition.
- [ ] Test on a real iPhone (Safari) and Android (Chrome).
- [ ] Deploy to Cloud Run (min = max = 1 instance, CPU always allocated).
- [ ] Rehearse the demo end to end at least once, a day early.

## 12. Background use (maps open) — roadmap

Browsers can't reliably keep a voice call running behind another app:

- **iOS Safari** suspends WebRTC and Web Audio as soon as Safari is backgrounded
  or the screen locks.
- **Android Chrome** has reports of the mic cutting out seconds to a minute
  after the tab is backgrounded.

So the hackathon build is a foreground web app (wake lock keeps the screen on).
The real fix, pitched as the next step, is a thin native shell with background
call audio (CallKit on iOS, a foreground service on Android) around the same
backend, rooms and voice commands.

## 13. Known risks

- Same-room echo with live mics (mitigated by demo joining muted, browser
  AEC/NS, rooms of ≤ 4, presenter "mute everyone").
- Cross-triggering: muted mics still stream to the listener, so one person
  saying "unmute" near several phones could trigger all of them. To be checked
  in the multi-phone test; the candidate fix is "loudest phone wins" within
  about 1.5 s.
- Speech recognition accuracy in a noisy room (phrase boosting, aliases, tune on
  laptop).
- Venue Wi-Fi (LiveKit Cloud handles NAT/TURN; have a phone hotspot as backup).
- Map tiles come from Esri's public tile service; if they fail, the corridor,
  jams and cars still draw on a dark background.
