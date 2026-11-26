import { Outlet, createRootRoute } from "@tanstack/react-router";
import { Header } from "../components/header";
import { TxCard } from "../components/TxCard";
import { IndexerStatusBanner } from "../components/IndexerStatusBanner";
import { WalletKitBanner } from "../components/wallet/WalletKitBanner";

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  return (
    <main className="bg-skbw min-h-screen flex flex-col font-nunito w-full overflow-x-hidden isolate">
      <Header />
      <IndexerStatusBanner />
      <WalletKitBanner />
      <Outlet />
      <TxCard />
    </main>
  );
}
