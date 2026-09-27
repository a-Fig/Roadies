# Deploying Roadies

The [README](../README.md) runs everything locally with no accounts. This page covers real phones, real voice recognition and production.

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
