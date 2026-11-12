import './index.css';
import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { Toaster } from 'react-hot-toast';

// Import the generated route tree
import { routeTree } from './routeTree.gen';
import { WagmiProvider } from 'wagmi';
import { wagmiConfig } from './constants/wagmi.config';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClientConfig } from './constants/queryclient.config';
import { darkTheme, XellarKitProvider } from '@xellar/kit';
import { TokenRateProvider } from './components/providers/TokenProvider';
import { ChainSync } from './components/ChainSync';
import { I18nProvider } from './lib/i18n';

// Create a new router instance
const router = createRouter({ routeTree });

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

// Render the app
const rootElement = document.getElementById('root')!;
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <StrictMode>
      <I18nProvider>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClientConfig}>
          <XellarKitProvider theme={darkTheme}>
            <ChainSync />
            <TokenRateProvider>
              <RouterProvider router={router} />
            </TokenRateProvider>
            <Toaster />
          </XellarKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </I18nProvider>
    </StrictMode>,
  );
}
