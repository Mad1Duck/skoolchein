import { Component, type ReactNode } from 'react';
import { darkTheme, XellarKitProvider } from '@xellar/kit';
import { WalletKitDownContext } from './walletKitStatus';

/**
 * The wallet kit, made optional.
 *
 * XellarKitProvider fetches its settings from Xellar's server and THROWS when that fails (or when the
 * app is not enabled there). Everything is rendered inside it, so the whole site went blank, although
 * reading programs needs no wallet at all. Here the app is then rendered without the kit: browser
 * extension wallets still work (see WalletButtonState) and a banner says what is unavailable.
 *
 * An error from the app itself also lands here. It is thrown again by the fallback, with nothing left to
 * catch it, so it behaves as it did without this boundary.
 */
export class WalletKit extends Component<{ children: ReactNode }, { down: boolean }> {
  state = { down: false };

  static getDerivedStateFromError() {
    return { down: true };
  }

  componentDidCatch(error: Error) {
    console.error('[wallet kit] running without it:', error.message);
  }

  render() {
    if (this.state.down) {
      return <WalletKitDownContext.Provider value={true}>{this.props.children}</WalletKitDownContext.Provider>;
    }
    return <XellarKitProvider theme={darkTheme}>{this.props.children}</XellarKitProvider>;
  }
}
