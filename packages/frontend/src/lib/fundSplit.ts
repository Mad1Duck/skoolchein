/**
 * Who gets what when a program's remaining money is sent out, worked out before the transaction.
 * Mirrors ScholarshipTreasury (`releaseLeftover`, `_settleCancelled`, `_refundDonor`), including its
 * rounding and order, so the figures shown are the figures sent.
 */

export interface Share {
  wallet: string;
  amount: bigint;
}

/** A completed program's leftover: equal parts, the last recipient also takes the rounding remainder. */
export function splitLeftover(balance: bigint, finishers: readonly string[]): Share[] {
  const n = BigInt(finishers.length);
  if (n === 0n) return [];
  const each = balance / n;
  return finishers.map((wallet, i) => ({
    wallet,
    amount: i === finishers.length - 1 ? balance - each * (n - 1n) : each,
  }));
}

export interface CancelledSplit {
  /** What the creator is sent: everything that did not come from donors. */
  creator: bigint;
  /** What each donor gets back, never more than they gave. */
  donors: (Share & { donated: bigint })[];
  /** False when there are too many donors to pay at once: each then collects their own refund. */
  donorsPaidNow: boolean;
  /** What this one transaction sends out. */
  sentNow: bigint;
}

export function splitCancelled(
  balance: bigint,
  totalDonated: bigint,
  /** Every donor in the contract's order, with the donation still held for them. */
  donations: readonly { wallet: string; donated: bigint }[],
  maxPaidAtOnce: number,
): CancelledSplit {
  const creator = balance > totalDonated ? balance - totalDonated : 0n;
  let held = balance - creator;
  let outstanding = totalDonated;

  const donors = donations
    .filter((d) => d.donated > 0n)
    .map(({ wallet, donated }) => {
      const amount = held >= outstanding ? donated : (held * donated) / outstanding;
      held -= amount;
      outstanding -= donated;
      return { wallet, donated, amount };
    });

  const donorsPaidNow = donations.length <= maxPaidAtOnce;
  const sentNow = creator + (donorsPaidNow ? donors.reduce((sum, d) => sum + d.amount, 0n) : 0n);
  return { creator, donors, donorsPaidNow, sentNow };
}
