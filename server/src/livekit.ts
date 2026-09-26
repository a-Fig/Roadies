import { AccessToken, TrackSource, type VideoGrant } from 'livekit-server-sdk';

export interface TokenIssuerConfig {
  apiKey: string;
  apiSecret: string;
}

export function createTokenIssuer({ apiKey, apiSecret }: TokenIssuerConfig) {
  return async (identity: string, name: string, room: string, opts: { hidden?: boolean } = {}) => {
    const token = new AccessToken(apiKey, apiSecret, { identity, name, ttl: '6h' });
    const grant: VideoGrant = {
      roomJoin: true,
      room,
      canPublish: !opts.hidden,
      canSubscribe: true,
      canPublishData: false,
      canUpdateOwnMetadata: false,
      hidden: opts.hidden ?? false,
    };
    // Phones may only publish their mic (never camera/screen-share); the
    // hidden listener doesn't publish at all, so leave its grant as-is.
    if (!opts.hidden) grant.canPublishSources = [TrackSource.MICROPHONE];
    token.addGrant(grant);
    return token.toJwt();
  };
}
