import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { DashboardCard } from "./DashboardCard";
import { NeoButton } from "@/components/ui/NeoButton";
import { useClaimStudentNFT } from "@/lib/contracts/v4/hooks/core";
import { uploadToIPFS } from "@/lib/ipfs";
import type { DashboardData } from "@/lib/api/types";

interface DashboardNftCollectionsProps {
  address?: `0x${string}`;
  dashboard?: DashboardData;
}

export function DashboardNftCollections({
  address,
  dashboard,
}: DashboardNftCollectionsProps) {
  const [claiming, setClaiming] = useState(false);
  const { claim, isPending } = useClaimStudentNFT();

  const hasDonated = (dashboard?.votes.length ?? 0) > 0 || (dashboard?.stakes.length ?? 0) > 0;
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
        NFT Collections
      </h2>
      <p className="text-sm text-gray-600 mb-4">
        Credential NFTs are soulbound and minted automatically by the protocol.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* DonorNFT — minted by ScholarshipCore.donate() */}
        <DashboardCard className="flex flex-col">
          <div className="h-24 -mx-4 -mt-4 rounded-t-xl border-b-4 border-black bg-skyellow" />
          <div className="pt-4 space-y-2 grow flex flex-col">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-2">
                <img
                  src={`https://api.dicebear.com/9.x/thumbs/svg?seed=${seed}-donor`}
                  alt="Donor Badge"
                  className="size-8 rounded-full border-2 border-black"
                />
                <h3 className="font-bold text-lg">Donor Badge</h3>
              </div>
              <span
                className={`text-[10px] font-extrabold uppercase px-1.5 py-0.5 border border-black rounded ${
                  hasDonated ? "bg-skgreen text-black" : "bg-gray-100 text-gray-600"
                }`}
              >
                DonorNFT
              </span>
            </div>
            <p className="text-sm text-gray-600 grow">
              Minted automatically when your donation to a program is accepted.
            </p>
            {hasDonated ? (
              <NeoButton label="Earned" variant="secondary" size="sm" disabled fullWidth />
            ) : (
              <Link to="/programs" className="contents">
                <NeoButton label="Donate to Earn" variant="primary" size="sm" fullWidth />
              </Link>
            )}
          </div>
        </DashboardCard>

        {/* StudentNFT — defined but auto-mint not wired in current v4 */}
        <DashboardCard className="flex flex-col">
          <div className="h-24 -mx-4 -mt-4 rounded-t-xl border-b-4 border-black bg-skcyan" />
          <div className="pt-4 space-y-2 grow flex flex-col">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-2">
                <img
                  src={`https://api.dicebear.com/9.x/thumbs/svg?seed=${seed}-student`}
                  alt="Scholarship Hero"
                  className="size-8 rounded-full border-2 border-black"
                />
                <h3 className="font-bold text-lg">Scholarship Hero</h3>
              </div>
              <span
                className={`text-[10px] font-extrabold uppercase px-1.5 py-0.5 border border-black rounded ${
                  isScholar ? "bg-skgreen text-black" : "bg-gray-100 text-gray-600"
                }`}
              >
                StudentNFT
              </span>
            </div>
            <p className="text-sm text-gray-600 grow">
              Soulbound credential for graduating a scholarship program. Claimable once all mandatory milestones are completed.
            </p>
            {canClaimStudentNFT ? (
              <NeoButton
                label={claiming || isPending ? "Claiming..." : "Claim StudentNFT"}
                variant="primary"
                size="sm"
                fullWidth
                onClick={handleClaimStudentNFT}
                loading={claiming || isPending}
                disabled={claiming || isPending}
              />
            ) : isScholar ? (
              <NeoButton label="In Progress" variant="secondary" size="sm" disabled fullWidth />
            ) : (
              <Link to="/programs" className="contents">
                <NeoButton label="Apply to Become Eligible" variant="primary" size="sm" fullWidth />
              </Link>
            )}
          </div>
        </DashboardCard>
      </div>
    </section>
  );
}
