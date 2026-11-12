# Crypto-Invisible UX Guide

Goal: a person who has never used crypto can donate, apply, vote, and withdraw on this app **without ever learning that it runs on a blockchain**. They only need the basics they already know: an account, a balance, a payment, a confirmation.

Blockchain stays as the trust layer (transparent votes, locked milestone funds, arbitration). It is not the user interface.

> Status: design guide. Items marked **[verify]** come from reading the frontend quickly and must be confirmed in code before implementing.

---

## 1. Principles

1. **Say what happens, not how.** "Donate Rp 50.000", not "Approve USDC and call donate()".
2. **Zero blockchain vocabulary** in the default UI. No wallet, gas, signing, hash, 0x, stake, on-chain, NFT, mint, network.
3. **One action = one click + one confirmation.** Multi-step crypto flows (approve, then act) are hidden behind a single button.
4. **Local currency first.** Show IDR (the app already fetches a USDC/IDR rate); show USDC only under "details".
5. **Progressive disclosure.** Every technical detail (address, tx hash, explorer link) is available under an "Advanced / Proof" section for people who want to verify, never in the main flow.
6. **Failures speak human.** Never show raw errors like `execution reverted` or `user rejected the request`.
7. **Be honest, not secretive.** Hiding crypto is about reducing friction, not deceiving. Terms of service and an "About this app" page must state that records are stored on a public blockchain.

---

## 2. Where the app is today

What the frontend (`packages/frontend`) does now **[verify]**:

| Area | Current behavior | Problem for non-crypto users |
|---|---|---|
| Login | `@xellar/kit` provider + wagmi; supports external wallets and, via Xellar, embedded wallets | Good base. Wallet-connect modal is still the entry point |
| Transactions | `useTxHook()` wraps wagmi `useWriteContract`, one call per transaction | User must approve each tx in a wallet popup; token approve + action are separate |
| Gas | User pays gas in the chain's native token | Users must hold ETH. Biggest blocker |
| Money | Amounts shown in USDC; IDR rate fetched from CoinGecko (`TokenProvider.tsx`) | IDR is available but not the primary display |
| Identity | Addresses shown as `0x1234...abcd`, avatars from a hash seed | Meaningless to normal users |
| Copy | "Confirm Transaction in Wallet", "Stake & Dispute", "recorded on-chain", "Student NFT", "Target Scholar Wallet 0x..." | Heavy jargon across modals |
| Networks | Lisk, Lisk Sepolia, Ganache, custom "Nawasena" (id 31338) | Users must never see or pick a network |
| Hard-coded | RPC fallback is an `http://` private IP | Breaks on https; fix before launch |

---

## 3. Jargon translation table

Use these replacements in all user-facing text.

| Crypto term in code | Say this to users |
|---|---|
| Connect wallet | Sign in / Log in |
| Wallet address `0x...` | Account name or short ID; never the raw address |
| USDC | Rp amount (USDC only under "details") |
| Transaction / Sign / Confirm in wallet | Confirm / "Confirm donation" |
| Gas / network fee | Included, or "Service fee Rp X" |
| Approve token spend | (invisible, bundled into the action) |
| On-chain / recorded on blockchain | "Permanently recorded" / "Verified record" |
| Stake / Confidence stake | Deposit / Guarantee (refundable) |
| Slashed | Lost deposit / Deposit forfeited |
| Commit-reveal vote | Sealed vote (revealed together later) |
| Oracle review | Verification by the review team |
| NFT / Mint / Claim NFT | Badge / Certificate / "Get your badge" |
| Reputation NFT | Supporter badge / Scholar badge |
| Arbiters | Independent reviewers |
| Tx hash / explorer | "Proof of record" link under Advanced |
| Protocol fee | Platform fee |
| Voting power (USDC) | Voting weight (based on your donations) |
| Wrong network | (never shown; the app switches automatically) |

---

## 4. Target experience, flow by flow

### 4.1 Sign in
- Options: Google / email / phone one-time code. No "Connect Wallet" button, no extension required.
- Behind the scenes an embedded wallet is created for the user (Xellar already in the stack **[verify the embedded-wallet mode is enabled for production; config is `xellarEnv: "sandbox"` today]**).
- Optional later: "Use my own wallet" under Advanced for crypto-native users.

### 4.2 Add money (donors)
- "Top up" via local payment methods (bank transfer, e-wallet, QRIS), converted to the stablecoin in the background through an on/off-ramp provider.
- Balance shown as `Rp 1.250.000`.
- Needs a provider decision (see section 7).

### 4.3 Donate
- Button: **Donate Rp 100.000**. One confirmation screen: amount, fee, what the donor gets (voting weight + supporter badge).
- Hidden: token approval + donate call batched into one user action.
- Success screen: "Thank you. Your donation is recorded." with Advanced > proof link.

### 4.4 Vote
- Show candidate, milestones plan, and "Your voting weight: 120". One tap to vote.
- The sealed-vote (commit-reveal) steps for arbitration are automated: the app stores the secret and reveals it later, with a reminder notification. The user never manages a secret or a second transaction.

### 4.5 Apply and submit milestones (students)
- Plain form: name, plan, milestones (amount in Rp, proof required).
- Milestone proof upload goes through the existing IPFS/Pinata path; show it as "Upload file".
- Withdraw: "Withdraw Rp 500.000 to my bank" (off-ramp) or "Keep in balance".

### 4.6 Dispute and deposit
- "Report a problem" with a clear, refundable deposit explanation: "You'll get this back if the report is valid."
- Replace "Stake 10% of the program's total target fund" with the Rp amount and a plain outcome table: valid = deposit back + reward; rejected = deposit lost.

### 4.7 Badges
- "Student NFT" and "Changemaker NFT Hero" become **Scholar Badge** and **Changemaker Badge**.
- Claiming happens automatically after the qualifying event, or with one "Get badge" button. Free for the user.

---

## 5. Technical plan

### 5.1 Gasless transactions (highest impact)
Users must never need the native token.
- Use account abstraction (ERC-4337) with a paymaster, or the embedded-wallet provider's sponsored-transaction feature **[verify what Xellar supports on Lisk]**.
- Platform pays gas; cover it from the protocol fee or a gas budget with per-user rate limits to prevent abuse.
- Wrap in one hook so the rest of the app doesn't care.

### 5.2 One-click multi-step actions
- Replace `useTxHook()` usage for flows needing approve + action with a batched call (EIP-5792 `wallet_sendCalls` / smart-account batching), or use ERC-2612 `permit` if the token supports it.
- Keep `useTxHook` API (`isPending`, `isSuccess`, `error`) so modals change minimally; add a `useAction()` wrapper that returns human-readable status.

### 5.3 Local currency layer
- Central `formatMoney(usdcAmount)` utility using the rate from `TokenProvider`.
- Rate fetch currently falls back to a hard-coded 16000 IDR if CoinGecko fails; show a stale-rate indicator or use a server-side cached rate instead of calling a third party from every browser.
- All displayed amounts go through this utility; grep for `USDC` in `src/features/v4` and replace.

### 5.4 Human identity instead of addresses
- Store a display name per account (from login profile) and map address to name via the backend/indexer.
- Replace `wallet.slice(0,8)...` and `shortenAddress()` in the UI with name + avatar. Keep address under Advanced.
- Replace "Target Scholar Wallet 0x..." inputs with a user search/picker.

### 5.5 Network handling
- Hide chain selection completely; pin a single chain per environment from env config.
- Remove Ganache and test chains from the production build.
- Fix the RPC default: it must be `https` and come from `VITE_RPC_URL` only (no private-IP fallback).

### 5.6 Error and status layer
Map common failures to friendly messages in one place:

| Raw situation | Message |
|---|---|
| User closes the confirm dialog | "No problem, nothing was charged." |
| Insufficient token balance | "Your balance is too low. Top up Rp X to continue." |
| Revert / contract rejection | "This can't be done right now: {reason in plain words}." |
| RPC / timeout | "Taking longer than usual. We'll keep trying; you don't need to repeat this." |
| Pending tx | Progress state with expected time, plus notification when done |

### 5.7 Notifications
- Email / push for: milestone approved, vote opened, reveal needed (automated), dispute outcome, funds released. This replaces users watching a wallet.

### 5.8 Advanced / Proof view
- A single collapsible panel per record: address, tx hash, explorer link, contract. This keeps transparency (the protocol's selling point) one click away.

---

## 6. Implementation checklist

1. [ ] Decide embedded-wallet + sponsored-gas stack (section 7).
2. [ ] Replace wallet-connect entry with social/email login in the header.
3. [ ] Build `useAction()` wrapper (batching + gas sponsorship + friendly errors) on top of `useTxHook()`.
4. [ ] Add `formatMoney()` and migrate all amount displays to IDR-first.
5. [ ] Jargon sweep with the table in section 3 across `src/features/v4/**` and `src/components/**`:
   - Modals: `DonateModal`, `VoteModal`, `ConfidenceStakeModal`, `CreateProgramModal`, dispute page, milestone pages.
6. [ ] Replace address displays with names/avatars; add Advanced panel.
7. [ ] Automate commit-reveal secret storage and reveal reminders.
8. [ ] Rename NFT UI to badges; auto-claim.
9. [ ] Remove test chains from prod config; fix https RPC default.
10. [ ] Add "About / How it's protected" page explaining the blockchain honestly.
11. [ ] Test with real non-crypto users (see section 8).

---

## 7. Decisions needed

1. **Wallet/gas provider**: stay on Xellar (check embedded wallet + paymaster support on Lisk) or add a smart-account SDK.
2. **On/off-ramp**: which provider supports IDR bank / QRIS, and what are the fees and KYC requirements?
3. **Custody model**: embedded (non-custodial with recovery) vs. app-managed. This has legal and security consequences.
4. **Who pays gas** and what the monthly budget cap is.
5. **Compliance**: handling real money, KYC, and local regulation for payments and fundraising. Confirm with legal before launch.
6. **Recovery**: how a user regains access if they lose their login method.

---

## 8. Acceptance criteria

A first-time user, with no crypto knowledge and no crypto in any wallet, can:

- [ ] Create an account in under 1 minute without installing anything.
- [ ] Top up and donate in under 3 minutes with at most one confirmation per action.
- [ ] Complete the whole flow without seeing the words: wallet, gas, hash, 0x address, network, NFT, stake.
- [ ] Understand what they paid and what they got (checked by asking them to explain it back).
- [ ] Find proof of a record under Advanced if they look for it.

Measure: task completion rate, drop-off per step, and support questions mentioning "wallet" or "fee".

---

## 9. Risks

- **Hidden costs**: sponsored gas can be drained; add rate limits and per-account caps.
- **Key loss**: embedded wallets need a recovery path or users lose funds.
- **Over-hiding**: if users can't verify anything, you lose the transparency advantage. Keep the Advanced panel.
- **Regulatory**: accepting and paying out money may require licensing; verify before offering fiat in/out.
- **Rate risk**: stablecoin/IDR rate changes between top-up and payout; show the locked rate at confirmation.
