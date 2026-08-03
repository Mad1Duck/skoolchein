import { defaultConfig } from "@xellar/kit";
import { lisk, liskSepolia } from "viem/chains";
import { defineChain } from "viem";

const ganacheLocal = defineChain({
  id: 1337,
  name: "Ganache Local",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: ["http://127.0.0.1:8545"], // Ganache's default RPC URL
    },
    public: {
      // Often the same as default for local networks
      http: ["http://127.0.0.1:8545"],
    },
  },
});

/**
 * RPC endpoint for the browser.
 *
 * MUST be https whenever the app itself is served over https — a page loaded
 * from https cannot call an http endpoint, the browser blocks it as "mixed
 * active content" and every request fails in the console while the wallet
 * (an extension, exempt from that rule) still looks connected.
 *
 * Set VITE_RPC_URL at build time (it is baked into the bundle). The http
 * fallback below only applies to local dev, where the page is also http.
 */
const NAWASENA_RPC = import.meta.env.VITE_RPC_URL ?? "http://100.73.196.95:8550";

if (
  typeof window !== "undefined" &&
  window.location.protocol === "https:" &&
  NAWASENA_RPC.startsWith("http://")
) {
  // Surface the misconfiguration explicitly — otherwise the only symptom is a
  // wall of "Blocked loading mixed active content" and an app that silently
  // reads nothing from chain.
  console.error(
    `[wagmi] VITE_RPC_URL is "${NAWASENA_RPC}" (http) but the app is served over https. ` +
    `The browser will block every RPC call as mixed content. Point VITE_RPC_URL at an ` +
    `https endpoint and rebuild — see the rpc.<domain> block in Caddyfile.example.`,
  );
}

const nawasena = defineChain({
  id: 31338,
  name: "Nawasena",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [NAWASENA_RPC] },
    public:  { http: [NAWASENA_RPC] },
  },
});

export const wagmiConfig = defaultConfig({
  appName: "Xellar",
  walletConnectProjectId: "383bde0d30cde408c7f223876495f1b1",
  xellarAppId: "cc1ec5df-f51b-4b65-adef-6ce93a1430dc",
  xellarEnv: "sandbox",
  ssr: false,
  chains: [lisk, liskSepolia, ganacheLocal, nawasena],
});