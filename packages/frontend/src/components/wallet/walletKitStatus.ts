import { createContext, useContext } from 'react';

/** True when the wallet kit could not start and the app runs without it. See WalletKit. */
export const WalletKitDownContext = createContext(false);
export const useWalletKitDown = () => useContext(WalletKitDownContext);
