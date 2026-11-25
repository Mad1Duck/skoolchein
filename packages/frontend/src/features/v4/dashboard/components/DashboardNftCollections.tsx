import { useEffect, useState } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { parseAbi, zeroAddress } from "viem";
import { scholarshipCoreAbi } from "@/constants/contractsV4";
import { useActiveChain, useV4Addresses } from "@/lib/chain/useActiveChain";
import { Link } from "@tanstack/react-router";
import { DashboardCard } from "./DashboardCard";
import { WalletBadges } from "./WalletBadges";
import { NeoButton } from "@/components/ui/NeoButton";
import { useClaimStudentNFT } from "@/lib/contracts/v4/hooks/core";
import { createBadgeMetadata, fetchProgramMeta } from "@/lib/ipfs";
import type { DashboardData } from "@/lib/api/types";
import { useT } from "@/lib/i18n";

interface DashboardNftCollectionsProps {
  address?: `0x${string}`;
  dashboard?: DashboardData;
  variant?: "provider" | "student";
}

export function DashboardNftCollections({
  address,
  dashboard,
  variant = "student",
}: DashboardNftCollectionsProps) {
  const { t } = useT();
  const [claiming, setClaiming] = useState(false);
  const [failed, setFailed] = useState(false);
  const { claim, isPending, isSuccess } = useClaimStudentNFT();
  const { chainId } = useActiveChain();
  const v4 = useV4Addresses();

  // Which completed programs this wallet already holds a badge for (one badge per program).
  const completed = (dashboard?.scholarships ?? []).filter((s) => s.scholar.status === "COMPLETED");
  const { data: studentNFT } = useReadContract({
    chainId,
    address: v4.ScholarshipCore,
    abi: scholarshipCoreAbi,
    functionName: "studentNFT",
  });
  const nft = studentNFT && studentNFT !== zeroAddress ? (studentNFT as `0x${string}`) : undefined;
  const { data: minted, refetch } = useReadContracts({
    contracts: completed.map((s) => ({
      chainId,
      address: nft,
      abi: parseAbi(["function hasMinted(address,uint256) view returns (bool)"]),
      functionName: "hasMinted" as const,
      args: [address!, BigInt(s.scholar.pid)] as const,
    })),
    query: { enabled: !!nft && !!address && completed.length > 0 },
  });
  useEffect(() => {
    if (isSuccess) void refetch();
  }, [isSuccess, refetch]);

  const completedScholarship = completed.find((_, i) => minted?.[i]?.result === false);
  const canClaimStudentNFT = !!completedScholarship;
  const allClaimed = completed.length > 0 && !!minted && minted.every((m) => m.result === true);

  const seed = address ? address.slice(2, 10) : "nft";

  const handleClaimStudentNFT = async () => {
    if (!completedScholarship || !address) return;
    setClaiming(true);
    try {
      const pid = completedScholarship.scholar.pid;
      const cid = completedScholarship.program?.metadataCID;
      const meta = cid ? await fetchProgramMeta(cid).catch(() => null) : null;
      const uri = await createBadgeMetadata({ kind: "student", wallet: address, pid, programName: meta?.name });
      // A badge cannot be changed after minting, so it is not minted without its picture.
      if (!uri) {
        setFailed(true);
        return;
      }
      setFailed(false);
      claim(BigInt(pid), uri);
    } finally {
      setClaiming(false);
    }
  };

  return (
    <section>
      <h2 className="font-paytone text-3xl mb-4 border-l-8 border-skpurple pl-4 leading-none">
        {t("badges.title")}
      </h2>
      {variant === "student" ? (
        <DashboardCard className="flex flex-col overflow-hidden border-skcyan">
          <div className="h-48 -mx-4 -mt-4 bg-skcyan border-b-4 border-black flex items-center justify-center relative">
            <span className="absolute top-3 left-3 bg-black text-white text-xs font-extrabold px-2 py-1 rounded border border-black">
              #001
            </span>
            <img
              src={`https://api.dicebear.com/9.x/notionists/svg?seed=${seed}-student&backgroundColor=c0aede`}
              alt={t("badges.scholarBadge")}
              className="size-40 drop-shadow-[4px_4px_0_rgba(0,0,0,1)]"
            />
          </div>
          <div className="pt-5 space-y-3 grow flex flex-col">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-paytone text-xl">{t("badges.scholarBadge")}</h3>
                <p className="text-sm text-gray-600">{address ? `${address.slice(0, 6)}...${address.slice(-4)}` : t("badges.scholar")}</p>
              </div>
              <span className="bg-skgreen text-black text-[10px] font-extrabold uppercase px-2 py-1 border border-black rounded">
                {t("badges.scholarTag")}
              </span>
            </div>
            <p className="text-sm text-gray-600 grow">
              {t("badges.scholarBody")}
            </p>
            {failed && <p className="text-xs font-bold text-skred">{t("badges.imageFailed")}</p>}
            {canClaimStudentNFT ? (
              <NeoButton
                label={claiming || isPending ? t("badges.claiming") : t("badges.claim")}
                variant="primary"
                size="sm"
                fullWidth
                onClick={handleClaimStudentNFT}
                loading={claiming || isPending}
                disabled={claiming || isPending}
              />
            ) : completedScholarship ? (
              <NeoButton label={allClaimed ? t("badges.claimed") : t("badges.eligible")} variant="secondary" size="sm" disabled fullWidth />
            ) : (
              <Link to="/programs" className="contents">
                <NeoButton label={t("badges.apply")} variant="primary" size="sm" fullWidth />
              </Link>
            )}
          </div>
        </DashboardCard>
      ) : (
        <DashboardCard className="flex flex-col overflow-hidden border-skyellow">
          <div className="h-48 -mx-4 -mt-4 bg-skyellow border-b-4 border-black flex items-center justify-center relative">
            <span className="absolute top-3 left-3 bg-black text-white text-xs font-extrabold px-2 py-1 rounded border border-black">
              #001
            </span>
            <img
              src={`https://api.dicebear.com/9.x/bottts/svg?seed=${seed}-hero&backgroundColor=b6e3f4`}
              alt={t("badges.changemakerBadge")}
              className="size-40 drop-shadow-[4px_4px_0_rgba(0,0,0,1)]"
            />
          </div>
          <div className="pt-5 space-y-3 grow flex flex-col">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-paytone text-xl">{t("badges.changemakerBadge")}</h3>
                <p className="text-sm text-gray-600">{t("badges.impactCreator")}</p>
              </div>
              <span className="bg-skyellow text-black text-[10px] font-extrabold uppercase px-2 py-1 border border-black rounded">
                {t("badges.providerTag")}
              </span>
            </div>
            <p className="text-sm text-gray-600 grow">
              {t("badges.providerBody")}
            </p>
            <Link to="/programs" className="contents">
              <NeoButton label={t("badges.create")} variant="primary" size="sm" fullWidth />
            </Link>
          </div>
        </DashboardCard>
      )}
      <WalletBadges />
    </section>
  );
}
