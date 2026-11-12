import axios from "axios";
import { getActiveChainId } from "@/lib/chain/chains";

/**
 * Ponder v4 REST API client.
 * Base URL comes from VITE_BACKEND_HOST env var.
 */
export const api = axios.create({
  baseURL: `${import.meta.env.VITE_BACKEND_HOST}/v4`,
  timeout: 15_000,
  headers: { "Content-Type": "application/json" },
});

// Scope every /v4 request to the active chain. `synchronous: true` makes axios run
// this at call time, so the chain is the one the calling query set a moment ago
// (see useChainQuery) rather than whatever it is when a microtask finally runs.
api.interceptors.request.use(
  (config) => {
    config.params = { chainId: getActiveChainId(), ...config.params };
    return config;
  },
  undefined,
  { synchronous: true },
);

/** Raw backend client (non-v4 endpoints like /sse, /ipfs) */
export const rawApi = axios.create({
  baseURL: import.meta.env.VITE_BACKEND_HOST,
  timeout: 15_000,
});
