import { AccessToken } from 'livekit-server-sdk';

export interface TokenIssuerConfig {
  apiKey: string;
  apiSecret: string;
}

export function createTokenIssuer({ apiKey, apiSecret }: TokenIssuerConfig) {
  return async (identity: string, name: string, room: string, opts: { hidden?: boolean } = {}) => {
    const token = new AccessToken(apiKey, apiSecret, { identity, name, ttl: '6h' });
    token.addGrant({
      roomJoin: true,
      room,
      canPublish: !opts.hidden,
      canSubscribe: true,
      canPublishData: false,
      canUpdateOwnMetadata: false,
      hidden: opts.hidden ?? false,
    });
    return token.toJwt();
  };
}
