# Roadies
Proximity chat for when we're stuck in traffic. (Repo name: TrafficLive.)

Discord-style, hands-free **voice** rooms for drivers stuck in the same jam.
Say `mute`, `unmute`, `deafen`, `undeafen`, `disconnect`, `connect` or `random`; no screen needed.

See [DESIGN.md](DESIGN.md) for the full design and every decision behind it.

| URL | What |
| --- | --- |
| `/demo` | Hackathon demo: random car, simulated spot on US-101 NB. `?spot=hospital-curve` / `sfo` / `loner` … forces a spot. |
| `/` | Normal mode: set up your car once (`/setup`), then drive with real GPS. |
| `/presenter?key=demo` | Projector: channel list, live map, QR code. Press **A** for presenter controls. |

## Run it locally

Needs Node 22+.

```sh
npm install
brew install livekit        # macOS; on Linux and Windows (Git Bash) the script downloads it
npm run dev                 # LiveKit (dev mode) + server :8080 + web :5173
```

Open <http://localhost:5173/presenter?key=demo> and a few tabs of
<http://localhost:5173/demo> (each tab is its own car). With no `.env`, voice
runs on the local LiveKit server and spoken commands come from the **fake
recognizer**: make a car "say" something with

```sh
curl -X POST localhost:8080/dev/say -H 'content-type: application/json' \
  -d '{"name":"Teal Civic","text":"mute"}'
```

Fill the demo with talking fake phones (they beep instead of speaking):

```sh
npm run fake-phones -- 12                 # scripted spots, like real joiners
npm run fake-phones -- 3 hospital-curve   # force a spot
```

### Presenter keys

`A` controls panel · `L` spawn a lone commuter (always starts its own room,
even if another room has a free seat, so it's actually alone; merges after
15 s) · `M` mute everyone · `F` show the whole corridor · `R` reset the demo.
Click a car or member to mute it. `?join=https://…/demo` overrides the QR target.

## Real phones, real voice commands

Phones need HTTPS for the microphone, and an HTTPS page can't use the local
`ws://` LiveKit server, so use LiveKit Cloud:

1. Create a LiveKit Cloud project; copy `.env.example` to `.env` and set
   `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.
2. Google Speech-to-Text:
   ```sh
   gcloud services enable speech.googleapis.com
   gcloud auth application-default login
   gcloud auth application-default set-quota-project YOUR_PROJECT
   ```
   then set `RECOGNIZER=google` (and `LOG_TRANSCRIPTS=1` while tuning) in `.env`.
3. `npm run dev:app` (server + web, no local LiveKit), then expose the web app:
   `cloudflared tunnel --url http://localhost:5173` (or `ngrok http 5173`) and open
   the tunnel URL's `/demo` on your phone.

## Tests

```sh
npm test            # unit tests (matchmaker, voice commands, speech gate, world)
npm run typecheck
npm run e2e         # Playwright: real Chromium phones + local LiveKit + server
```

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every pull request and on
push to `main`, on `ubuntu-latest` with Node 22:

- **check**: `npm ci`, `npm run typecheck`, `npm test`, `npm run build`.
- **e2e**: `npm ci`, installs Chromium via Playwright, then `npm run e2e`
  against a local LiveKit dev server and the app server with `RECOGNIZER=fake`
  — no secrets or `.env` needed. On failure the HTML report and traces upload
  as the `playwright-report` artifact.

Both jobs run in parallel to keep wall time down. A new push to the same
branch/PR cancels the previous run.

## Deploy (Google Cloud Run)

One always-on instance: all state is in memory, and the command listener runs
continuously.

```sh
PROJECT=your-project
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com speech.googleapis.com --project $PROJECT
# Let the runtime service account call Speech-to-Text.
SA=$(gcloud projects describe $PROJECT --format='value(projectNumber)')-compute@developer.gserviceaccount.com
gcloud projects add-iam-policy-binding $PROJECT --member serviceAccount:$SA --role roles/speech.client

gcloud run deploy roadies --source . --project $PROJECT --region us-west1 \
  --allow-unauthenticated --min-instances 1 --max-instances 1 \
  --no-cpu-throttling --timeout 3600 --session-affinity \
  --set-env-vars LIVEKIT_URL=wss://your-project.livekit.cloud,LIVEKIT_API_KEY=...,LIVEKIT_API_SECRET=...,PRESENTER_KEY=pick-something
```

Then open `https://<service-url>/presenter?key=<PRESENTER_KEY>` on the projector.

### Custom domain (roadies.afig.dev)

A Cloudflare Worker in `deploy/proxy/` passes `roadies.afig.dev` through to the
Cloud Run URL (pages, assets and the `/ws` socket; LiveKit audio goes to LiveKit
Cloud directly). Set `ORIGIN` in `deploy/proxy/wrangler.jsonc` to the service URL,
then `npx wrangler deploy -c deploy/proxy/wrangler.jsonc` (creates the DNS record
and certificate). The presenter's QR code uses the page's own origin, so open the
projector at `https://roadies.afig.dev/presenter?key=...`.
