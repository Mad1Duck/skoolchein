import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { DashboardCard } from "./DashboardCard";
import { WalletBadges } from "./WalletBadges";
import { NeoButton } from "@/components/ui/NeoButton";
import { useClaimStudentNFT } from "@/lib/contracts/v4/hooks/core";
import { uploadToIPFS } from "@/lib/ipfs";
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
  const { claim, isPending } = useClaimStudentNFT();

  const completedScholarship = dashboard?.scholarships.find(
    (s) => s.scholar.status === "COMPLETED"
  );
  const canClaimStudentNFT = !!completedScholarship;

  const seed = address ? address.slice(2, 10) : "nft";

  const handleClaimStudentNFT = async () => {
    if (!completedScholarship) return;
    setClaiming(true);
    try {
      const programName = completedScholarship.program?.pid
        ? `Program #${completedScholarship.program.pid}`
        : "Scholarship Program";
      const uploaded = await uploadToIPFS({
        meta: {
          name: "Scholarship Graduate",
          description: `Credential for completing ${programName}`,
          program: completedScholarship.program?.pid,
        },
        type: "student-nft",
        name: "Scholarship Graduate",
      });
      if (!uploaded?.metaCID) return;
      claim(BigInt(completedScholarship.scholar.pid), `ipfs://${uploaded.metaCID}`);
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
              <NeoButton label={t("badges.eligible")} variant="secondary" size="sm" disabled fullWidth />
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
