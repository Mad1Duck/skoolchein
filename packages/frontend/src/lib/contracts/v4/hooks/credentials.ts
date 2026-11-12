import { useQuery } from "@tanstack/react-query";
import { useAccount, usePublicClient, useReadContracts, useWalletClient } from "wagmi";
import { parseAbiItem, zeroAddress } from "viem";
import { scholarshipCoreAbi } from "@/constants/contractsV4";
import { useActiveChain, useV4Addresses } from "@/lib/chain/useActiveChain";

/**
 * Soulbound credential NFTs (ScholarshipNFTs.sol). They are not enumerable
 * (no tokenOfOwnerByIndex), so a wallet's token ids are recovered from the
 * mint `Transfer(0x0 → wallet)` logs.
 */
export type CredentialKind = "student" | "donor" | "fraud";

export interface OwnedCredential {
  kind: CredentialKind;
  contract: `0x${string}`;
  tokenId: bigint;
  symbol: string;
}

const SYMBOL: Record<CredentialKind, string> = { student: "SGNFT", donor: "SDNFT", fraud: "SCAM" };
const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)");

/** Credential NFTs minted to the connected wallet. */
export function useOwnedCredentials() {
  const { address } = useAccount();
  const { chainId } = useActiveChain();
  const v4 = useV4Addresses();
  const client = usePublicClient({ chainId });

  // The NFT contract addresses live on ScholarshipCore.
  const { data: nftAddrs } = useReadContracts({
    allowFailure: true,
    contracts: (["studentNFT", "donorNFT", "fraudNFT"] as const).map((functionName) => ({
      chainId,
      address: v4.ScholarshipCore,
      abi: scholarshipCoreAbi,
      functionName,
    })),
  });

  const contracts: { kind: CredentialKind; address: `0x${string}` }[] = [];
  (["student", "donor", "fraud"] as const).forEach((kind, i) => {
    const a = nftAddrs?.[i]?.result as `0x${string}` | undefined;
    if (a && a !== zeroAddress) contracts.push({ kind, address: a });
  });

  return useQuery({
    queryKey: ["credentials", chainId, address, contracts.map((c) => c.address).join(",")],
    enabled: !!address && !!client && contracts.length > 0,
    staleTime: 15_000,
    queryFn: async (): Promise<OwnedCredential[]> => {
      const out: OwnedCredential[] = [];
      for (const c of contracts) {
        const logs = await client!.getLogs({
          address: c.address,
          event: TRANSFER,
          args: { from: zeroAddress, to: address },
          fromBlock: 0n,
          toBlock: "latest",
        });
        for (const l of logs) {
          // Soulbound, so a minted token can only have left via burn — confirm it is still held.
          try {
            const owner = await client!.readContract({
              address: c.address,
              abi: [parseAbiItem("function ownerOf(uint256) view returns (address)")],
              functionName: "ownerOf",
              args: [l.args.tokenId!],
            });
            if (owner.toLowerCase() !== address!.toLowerCase()) continue;
          } catch {
            continue; // burned
          }
          out.push({ kind: c.kind, contract: c.address, tokenId: l.args.tokenId!, symbol: SYMBOL[c.kind] });
        }
      }
      return out;
    },
  });
}

/**
 * Ask the wallet to display an ERC-721 (EIP-747 `wallet_watchAsset`).
 * Resolves true when the user accepted. Throws a readable Error when the wallet
 * cannot do it (some embedded wallets do not implement wallet_watchAsset).
 */
export function useWatchNft() {
  const { data: walletClient } = useWalletClient();

  return async (contract: `0x${string}`, tokenId: bigint): Promise<boolean> => {
    if (!walletClient) throw new Error("Connect your wallet first.");
    try {
      const ok = await walletClient.request({
        method: "wallet_watchAsset",
        params: { type: "ERC721", options: { address: contract, tokenId: tokenId.toString() } },
        // viem's typed request only lists ERC20 for this method.
      } as never);
      return Boolean(ok);
    } catch (err) {
      const e = err as { code?: number; message?: string };
      if (e?.code === 4001) return false; // user rejected
      throw new Error(e?.message || "This wallet does not support adding NFTs automatically.");
    }
  };
}
