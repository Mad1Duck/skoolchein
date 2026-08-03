import { PinataSDK } from 'pinata';

/**
 * Pinata is the only pinning backend.
 *
 * There used to be an `ipfs-http-client` node fallback here, selected simply by
 * whether PINATA_JWT happened to be set. That made a *configuration* mistake
 * look like an *infrastructure* outage: with the JWT missing (or misnamed —
 * `VITE_PINATA_JWT` does not reach the server, the VITE_ prefix is a
 * frontend build-time convention and would also bake the secret into the public
 * bundle), uploads silently routed to a node that wasn't running and surfaced as
 * "Unable to connect. Is the computer able to access the url?".
 *
 * Failing at startup instead means a missing key is unmistakable.
 */
if (!process.env.PINATA_JWT) {
  throw new Error(
    'PINATA_JWT is required for packages/backend (IPFS uploads). ' +
    'Note the variable is PINATA_JWT, not VITE_PINATA_JWT — see root .env.example.',
  );
}

if (!process.env.PINATA_GATEWAY) {
  throw new Error(
    'PINATA_GATEWAY is required for packages/backend (e.g. "example.mypinata.cloud"). ' +
    'Without it, uploads succeed but every returned URL is unreachable.',
  );
}

export const pinata = new PinataSDK({
  pinataJwt: process.env.PINATA_JWT,
  pinataGateway: process.env.PINATA_GATEWAY,
});

// Normalised: tolerate the gateway being configured with or without a scheme.
const gatewayHost = process.env.PINATA_GATEWAY.replace(/^https?:\/\//, '').replace(/\/+$/, '');

export const ipfsPinataGateway = `https://${gatewayHost}/ipfs`;
