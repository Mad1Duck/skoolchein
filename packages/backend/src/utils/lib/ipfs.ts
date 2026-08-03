import { PinataSDK } from 'pinata';
import { logger } from '@/utils/logger';

/**
 * Pinata is the only pinning backend.
 *
 * There used to be an `ipfs-http-client` node fallback here, selected simply by
 * whether PINATA_JWT happened to be set. That made a *configuration* mistake
 * look like an *infrastructure* outage: with the JWT missing (or misnamed —
 * `VITE_PINATA_JWT` does not reach the server, the VITE_ prefix is a frontend
 * build-time convention and would also bake the secret into the public bundle),
 * uploads silently routed to a node that wasn't running and surfaced as
 * "Unable to connect. Is the computer able to access the url?".
 *
 * Validation is deliberately LAZY — a warning at boot, an error on first
 * upload. Throwing at import time would take the whole process down (REST API,
 * SSE broadcaster, health checks) over credentials that only one route needs,
 * which turns a broken upload button into a full outage and leaves Ponder
 * logging ConnectionRefused against /internal/sse/broadcast.
 */
const MISSING_JWT =
  'PINATA_JWT is not set, so IPFS uploads cannot work. ' +
  'Note the variable is PINATA_JWT, not VITE_PINATA_JWT — see root .env.example.';

const MISSING_GATEWAY =
  'PINATA_GATEWAY is not set (e.g. "example.mypinata.cloud"), so uploaded ' +
  'files would return unreachable URLs.';

if (!process.env.PINATA_JWT) logger.warn(MISSING_JWT);
if (!process.env.PINATA_GATEWAY) logger.warn(MISSING_GATEWAY);

let client: PinataSDK | undefined;

/** Throws a descriptive error (surfaced to the caller) if Pinata is unconfigured. */
export function getPinata(): PinataSDK {
  if (!process.env.PINATA_JWT) throw new Error(MISSING_JWT);
  if (!process.env.PINATA_GATEWAY) throw new Error(MISSING_GATEWAY);

  client ??= new PinataSDK({
    pinataJwt: process.env.PINATA_JWT,
    pinataGateway: process.env.PINATA_GATEWAY,
  });

  return client;
}

/** Gateway base URL, tolerating PINATA_GATEWAY written with or without a scheme. */
export function getPinataGateway(): string {
  if (!process.env.PINATA_GATEWAY) throw new Error(MISSING_GATEWAY);

  const host = process.env.PINATA_GATEWAY
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');

  return `https://${host}/ipfs`;
}
