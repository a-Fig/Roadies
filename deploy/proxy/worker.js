/**
 * roadies.afig.dev -> the Cloud Run service. A plain pass-through proxy:
 * pages, assets and the /ws control socket (WebSocket upgrades pass through
 * fetch). LiveKit audio does not go through here; phones reach LiveKit Cloud
 * directly.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = new URL(env.ORIGIN);
    url.protocol = origin.protocol;
    url.host = origin.host;
    return fetch(new Request(url, request));
  },
};
