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
| Languages | **English, French, Spanish, Vietnamese** for the phone UI and spoken commands. Chosen in settings (`/setup`); defaults to the phone's language. English commands are always accepted too. Matchmaking ignores language: everyone lands in rooms by proximity, so rooms can mix languages. The projector stays English. Added 2026-09-26. |
| Rooms | Max **4** people. Filled by proximity: always the closest room with a free seat. |
| Matchmaking | New car joins the closest active driver's room with a free seat, at **any distance** — else opens a new room. Alone ≥ 15 s → merged into the closest open room at any distance (unchanged). Sticky. **Changed 2026-09-26 by the owner** (dropped the old 5 km join cap; capacity 8 → 4). |
| Demo locations | Server assigns simulated spots on real 101 NB choke points; cars inch forward. Normal link uses real GPS. |
| Voice transport | **LiveKit** (Cloud in prod, `livekit-server --dev` locally). |
| Command recognition | **Server-side**: hidden listener joins each room, Google Speech-to-Text on each person's audio. |
| Hosting | Node + TypeScript server on **Google Cloud Run** (1 always-on instance, CPU always allocated). Laptop + tunnel as backup. |
| Join state | Normal mode joins **live** (unmuted), Discord default. Demo mode joins **muted** (you hear the room; say "unmute" to talk), because judges' phones share one table and open mics would feed back. Changed 2026-09-26 in the laptop session. |
| Flow | Open → the girlfriend's intro animation (every open of Your jam; tap skips; skipped under `prefers-reduced-motion`) → **Your jam** (the restyled Join screen: her wordmark, a jam card with live "drivers talking" count, and two big cards — `connect` / `random` — leading with the spoken command word) → **voice chat** (the restyled Drive screen once connected). The first tap on either card unlocks audio + mic and sends the first join; `connect` is today's closest-room join, `random` seats you in a uniformly random open room (or a new one) instead. Normal mode never forces `/setup`: first-ever open auto-assigns a random car, saved on the device; Setup stays reachable from a small gear icon on Your jam. Added 2026-09-26 (girlfriend's-design restyle). |
| Phone UI | **Glanceable driving mode**: one huge status line, giant buttons, no member list on the demo/scripted screens; the restyled voice-chat screen adds a small grid of up to 4 avatar circles (speaking ring, muted badge; "You" renders as your `CarArt` in your color, everyone else as a circle tinted by their car color with their car name as the one detail line). Minimal text throughout: drivers glance, they don't read — no paragraphs or instruction blocks, at most one short safety line (the privacy notice). Dark mode follows the OS setting on every phone screen (brand-kit tokens, `web/src/styles.css`); the presenter/projector is exempt and always dark. |
| Audio feedback | **Discord's own voice sounds** (mute, deafen, join, leave, …), so people instantly know them. Taken from Discord's web client for this non-commercial demo (owner's call, 2026-09-26); replace before any public release. |
| Fonts | **Bepory** (headings) + **Roboto** (body), from the owner's girlfriend's brand. Bepory is a free personal-use file, kept out of git (`web/public/fonts/`, gitignored) with a Roboto fallback if it's absent; owner's call, 2026-09-26; buy a license from rantaustudio.com before any public release. |
| After `disconnect` | Mic keeps listening for `connect` / `random` (screen shows a live preview of each). `connect` re-matches to the closest active driver with a free seat *right now*, same rule as joining — reactivates in place if that's your own (ghost) room. `random` jumps to a uniformly random open room other than your own; only works while disconnected. **Changed 2026-09-26 by the owner.** |
| Projector | Live map + Discord-style channel list + hidden presenter controls + QR code. |
| Home page | Shows a live count, e.g. "12 drivers talking": drivers with an open connection who haven't disconnected; bots excluded. |
| Identity | Demo: random car (e.g. "Teal Civic"). Normal: setup screen to pick car + name. No accounts. |
| Normal mode | Light but real: setup screen (saved on device, reachable any time from Your jam's gear icon — never forced) + real GPS matchmaking. |
| Look | ~90% Discord clone (grays, layout, rounded, channel list) with night-highway accents, restyled 2026-09-26 with the girlfriend's visual language (intro, wordmark, car art, jam/option cards) per her `gf-roadies` design — her work is the visual language, intro and layout ideas; this doc's product rules win wherever they differ, so it is not a port of her app. |
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
  - If there's **no match anywhere** *and* your ghost room has no other active
    members either, you also reactivate in place, rather than tearing the room
    down and opening an identical-but-renamed one right next to it.
  - Otherwise you're removed from the old room and added to the target (reason
    `reconnect`), or a brand new room is opened if there's no match at all and
    your ghost room still has other active members in it.
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
seven words boosted as phrase hints; streams are restarted before Google's
per-stream time limit. Aliases (e.g. "un mute") are normalized. Google's top 5
guesses are checked: a lower guess counts only when the best guess is at most
two words, or no longer than that guess's phrase ("coupe le micro" is three),
so conversation never triggers. A few observed mishearings (e.g. "Stephan" for
deafen) are parse-only aliases, never sent as phrase hints; they are kept per
recognizer language. Dev/tests use a `FakeRecognizer` fed by `POST /dev/say`.

**Languages:** each driver's phone sends its language (`en`, `fr`, `es`, `vi`)
in `hello`; the server keeps it on the car and hears that driver with a Google
recognizer in that language (`fr-FR`, `es-US`, `vi-VN`), boosted with that
language's phrases plus the English ones. `PHRASES` in `shared/src/voice.ts`
lists each language's phrases, first one = what the screen tells you to say:

| Command | fr | es | vi |
| --- | --- | --- | --- |
| `mute` | coupe le micro | apaga el micro | tắt mic |
| `unmute` | active le micro | prende el micro | bật mic |
| `deafen` | coupe le son | apaga el sonido | tắt loa |
| `undeafen` | remets le son | prende el sonido | bật loa |
| `disconnect` | déconnexion | desconectar | ngắt kết nối |
| `connect` | connexion | conectar | kết nối |

Parsing folds accents ("coupé" = "coupe", "đ" = "d"), and every language also
accepts the English words. Changing language in settings reloads the page, so
the phone says hello again and reconnects to LiveKit; the listener then hears
the new track in the new language.

Privacy note for the pitch: audio reaches our server for command detection;
nothing is stored.

## 5. Demo mode

- QR on the projector → `https://<host>/demo`. One tap ("Join the jam") is
  required so the browser allows mic + audio playback.
- You join **muted**: you hear the room, the screen says `MUTED · say "unmute"`,
  and saying "unmute" is the first thing you do.
- Each joiner gets a random car identity and a **server-assigned spot**. The
  assignment is scripted so every rule shows up early on the projector, and so
  it stays deterministic under any-distance joining:
  - the first **8** cars fill **Hospital Curve** past capacity (4) → a second
    room opens, then 2 more top the overflow room up to a full 4, so no
    partially-filled room is left open;
  - later joiners are scripted in same-jam **groups of 4** (one room's worth)
    — San Mateo, then SFO, then Palo Alto, then Mountain View, a lone
    commuter, then Redwood City, then San Jose, then another lone commuter,
    repeating. Grouping matters because joining is "closest free seat, any
    distance," not "closest jam": finishing each jam's room before starting
    the next guarantees every room is full when the next location's first car
    arrives, so it always opens a genuinely new, local room instead of
    bleeding into the last one;
  - the scripted **lone commuters** spawn far south (Morgan Hill / Gilroy)
    only between complete groups, once every room is full, so they actually
    start out alone — they sit alone, then get merged after 15 s.
- Jams (all 101 NB, spaced > 5 km apart so they read as distinct places on the
  map — room assignment itself is by capacity only, at any distance):
  San Jose (101/880), Mountain View (101/85), Palo Alto, Redwood City,
  San Mateo (101/92), Millbrae / SFO, Hospital Curve (101/280 merge).
- Cars inch north along the real highway geometry at crawl speed.
- `?spot=<jam>` forces a spot (for scripted presenter/teammate phones).
- `connect` and `random` aren't part of the scripted table demo (no phone is
  ever disconnected on cue) — they're exercised in normal mode, by tapping
  Disconnect/Connect/Random on any phone regardless of mode, and by the e2e
  tests (including a dedicated test that taps the "random" card).

## 6. Normal mode

- `/` → setup screen: pick car make, color, display name and language → saved
  on device → "Start driving" → real GPS (`watchPosition`) → matchmaking. The
  home page links to it as "Settings".
- The default name follows the language: "Teal Civic", "Civic turquoise",
  "Civic turquesa", "Civic xanh ngọc". A returning phone's hello carries its
  current name, so a rename or language switch shows up in the room right away.
- Same glanceable driving UI and voice commands as demo mode.

## 7. Phone UI (glanceable driving mode)

- One huge status line: room name + driver count, and who is talking now
  ("🟢 Teal Civic is talking").
- Whole screen tints **brake-light red** while muted/deafened, **go-green**
  accents while live, **amber** for warnings.
- While connected: three giant buttons, Mute, Deafen, Disconnect (Discord red).
  While disconnected, the buttons are replaced by the two cards below (there is
  no merged Disconnect/Connect button).
- Hint strip: `Say: mute · unmute · deafen · undeafen · disconnect`, flashing the
  last command heard; in another language it shows that language's phrases
  (`Dis : coupe le micro · …`). After disconnect: two tappable cards, one for
  `connect` and one for `random`. Text is kept to a glance, not a sentence
  (owner rule, 2026-09-26): each card leads with the spoken command and a
  short context line — who `connect` would match you with (`Teal Civic ·
  Hospital Curve`) or `New room`, and, when `random` has nowhere to go, a
  short notice (`No rooms open`) in place of a description. Tapping a card is
  the same as saying it (§3, §4).
- Audio: echo cancellation, noise suppression, auto gain on.
- Screen wake lock while in a room, so a mounted phone doesn't sleep. If the
  page is hidden anyway, show a "Keep Roadies on screen" notice on return.

## 8. Audio cues

Discord's own sound files (`web/public/audio/*.mp3`, from Discord's web client),
decoded once and played through Web Audio: mute, unmute, deafen, undeafen,
disconnect; connect and someone joining use Discord's join sound, someone
leaving its leave sound, being moved to another room its "moved" sound.
Audition them at `/sounds`.

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
- English commands for a French, Spanish or Vietnamese driver: the parser
  accepts them, but that driver's recognizer is not listening for English, and
  in a TTS test it caught only a few of them (fr 3/12, es 3/12, vi 7/12; en-US
  10/12 on the same clips). The screen only teaches the driver's own language.
  Translations have not been reviewed by native speakers yet.
- Venue Wi-Fi (LiveKit Cloud handles NAT/TURN; have a phone hotspot as backup).
- Map tiles come from Esri's public tile service; if they fail, the corridor,
  jams and cars still draw on a dark background.
