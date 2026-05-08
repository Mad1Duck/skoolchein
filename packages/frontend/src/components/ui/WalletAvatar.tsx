/** Deterministic flat-color avatar from a wallet address */
export function WalletAvatar({
  address,
  size = 40,
  className = "",
}: {
  address: string;
  size?: number;
  className?: string;
}) {
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    hash = address.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);

  return (
    <div
      className={`rounded-full border-[1.5px] border-black shadow-[2px_2px_0_0_rgba(0,0,0,0.8)] shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: `hsl(${hue}, 72%, 58%)`,
      }}
      title={address}
    />
  );
}

/** Truncate an address to 0x1234…abcd format */
export function shortenAddress(address: string, chars = 4): string {
  if (!address) return "";
  return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`;
}
