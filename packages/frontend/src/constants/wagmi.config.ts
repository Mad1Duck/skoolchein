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

const nawasena = defineChain({
  id: 31338,
  name: "Nawasena",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: [import.meta.env.VITE_RPC_URL ?? "http://100.73.196.95:8550"],
    },
    public: {
      http: [import.meta.env.VITE_RPC_URL ?? "http://100.73.196.95:8550"],
    },
  },
});

export const wagmiConfig = defaultConfig({
  appName: "Xellar",
  walletConnectProjectId: "383bde0d30cde408c7f223876495f1b1",
  xellarAppId: "cc1ec5df-f51b-4b65-adef-6ce93a1430dc",
  xellarEnv: "sandbox",
  ssr: false,
  // @ts-expect-error ytta
  chains: [lisk, liskSepolia, ganacheLocal, nawasena],
});