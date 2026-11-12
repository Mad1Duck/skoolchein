/**
 * English dictionary — the source of truth for translation keys.
 * `id.ts` must define every key here (enforced by its type).
 *
 * Wording rule: no crypto jargon in user-facing text. Say "confirm", "deposit",
 * "badge", "recorded" — not "sign", "stake", "NFT", "on-chain". Technical detail
 * belongs in an "Advanced" section, not the main flow.
 */
export const en = {
  // common
  'common.cancel': 'Cancel',
  'common.close': 'Close',
  'common.continue': 'Continue',
  'common.confirm': 'Confirm',
  'common.retry': 'Retry',
  'common.processing': 'Processing…',
  'common.language': 'Language',
  'common.advanced': 'Advanced',

  // network
  'chain.unsupported': 'Unsupported network',
  'chain.networkLabel': 'Network',

  // top up
  'topup.title': 'Add Funds',
  'topup.need': 'You need about {amount} more in USDC.',
  'topup.step1': 'Open one of the apps below and buy <strong>USDC</strong> with Rupiah.',
  'topup.step2': 'Withdraw that USDC to your wallet address below, using the <strong>{network}</strong> network.',
  'topup.step3': 'Wait a few minutes, then come back here. Your balance will update.',
  'topup.networkWarning': 'Choose the <strong>{network}</strong> network when withdrawing. If you pick the wrong one, the funds can be lost for good.',
  'topup.yourAddress': 'Your wallet address',
  'topup.connectFirst': 'Connect your wallet first',
  'topup.copy': 'Copy',
  'topup.copied': 'Copied',
  'topup.sentCheck': "I've sent it, check my balance",
  'topup.unavailable': 'Automatic top-up is not available yet. Coming soon.',
  'topup.wrongNetwork': 'You are on the <strong>{network}</strong> network, which cannot be topped up with real money. Switch to a main network in your wallet to add funds.',
  'topup.mockBanner': 'Simulation Mode',
  'topup.mockBody': 'No real money is used. Test balance is added to your wallet.',
  'topup.amountLabel': 'Amount (Rupiah)',
  'topup.equivalent': 'About {amount} USDC',
  'topup.pay': 'Pay (simulation)',
  'topup.failed': 'Could not add funds. Try again, or close and retry.',
  'topup.successTitle': 'Balance Added',
  'topup.successHeading': 'Funds added',
  'topup.successBody': 'Your balance increased by {amount}.',

  // errors
  'error.rejected': 'No problem — nothing was charged.',
  'error.insufficient': 'Your balance is too low for this. Add funds and try again.',
  'error.generic': 'Something went wrong. Please try again in a moment.',

  // vote
  'vote.title': 'Cast Your Vote',
  'vote.successTitle': 'Vote Cast Successfully!',
  'vote.successHeading': 'Your vote has been recorded!',
  'vote.successBody': 'You voted for {name} using {mode}.',
  'vote.modeDonation': 'your donation voting weight',
  'vote.modeReputation': 'your reputation points',
  'vote.introTitle': 'Two Ways to Vote',
  'vote.introBody': 'Choose how you want to support this candidate: use the voting weight you earned from donations, or your reputation points.',
  'vote.optDonationTitle': 'Donation voting weight',
  'vote.optDonationBody': 'Uses the voting weight you earned from your donations.',
  'vote.optReputationTitle': 'Reputation points',
  'vote.optReputationBody': 'Uses your reputation across the platform. Nothing is spent.',
  'vote.selected': 'SELECTED',
  'vote.locked': 'Your voting weight is locked for now because of a pending dispute or cooldown.',
  'vote.submitting': 'Submitting Vote',
  'vote.submittingBody': 'Please confirm to cast your vote for {name}.',
  'vote.loading': 'Loading…',
  'vote.confirm': 'Confirm Vote',

  // donate
  'donate.title': 'Donate to Program',
  'donate.successTitle': 'Donation Successful!',
  'donate.thanks': 'Thank you for your contribution!',
  'donate.successBody': 'You donated {amount} to {program}. A donor badge has been added to your account.',
  'donate.howTitle': 'How Donations Work',
  'donate.how1': 'Your donation gives you <strong>voting weight</strong> equal to the net amount',
  'donate.how2': 'A platform fee is deducted from all donations',
  'donate.how3': "You'll receive a <strong>donor badge</strong> as proof of your contribution",
  'donate.how4': 'You can back a scholar with a refundable deposit to earn a bonus',
  'donate.amountLabel': 'Donation Amount ({symbol})',
  'donate.approx': 'About {amount}',
  'donate.minimum': 'Minimum {min} {symbol}. A platform fee is deducted.',
  'donate.badgeLabel': 'Badge details link',
  'donate.badgeHint': 'Link to the details of your donor badge',
  'donate.shortfall': 'Your balance is about {amount} short. Add funds to continue.',
  'donate.shortfallToken': 'Your {symbol} balance is not enough.',
  'donate.addFunds': 'Add funds',
  'donate.preparing': 'Preparing {symbol}',
  'donate.preparingBody': 'Allowing the donation of <strong>{amount} {symbol}</strong>. Please confirm in your wallet.',
  'donate.confirmTitle': 'Confirm Donation',
  'donate.confirmBody': 'Confirm to donate <strong>{amount} {symbol}</strong> and receive your donor badge.',
  'donate.now': 'Donate Now',
  'donate.donating': 'Donating…',
} as const;

export type TranslationKey = keyof typeof en;
