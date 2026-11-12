import { useState } from "react";
import { useAccount } from "wagmi";
import { formatTokenWithSymbol, formatTokenAmount } from '@/lib/contracts/v4/token';
import { useDisputes, useMilestones } from "@/lib/api/hooks";
import { useTriggerAutoGuilty } from "@/lib/contracts/write-hooks";
import { NeoCard, NeoCardBody } from "@/components/ui/NeoCard";
import { NeoButton } from "@/components/ui/NeoButton";
import { NeoSkeleton } from "@/components/ui/NeoSkeleton";
import { RaiseDisputeModal } from "../components/RaiseDisputeModal";
import { DefendModal } from "../components/DefendModal";
import type { Milestone, Dispute, Scholar } from "@/lib/api/types";
import { useT } from "@/lib/i18n";

export function DisputesPage() {
  const { t } = useT();
  const { address } = useAccount();

  // Queries
  const { data: disputesRes, isLoading: loadingDisputes } = useDisputes();
  const { data: milestonesData, isLoading: loadingMilestones } = useMilestones({ status: "SUBMITTED" });

  const disputes = disputesRes?.data ?? [];
  const milestones = milestonesData ?? [];

  // Active Disputes
  const activeDisputes = disputes.filter(d => d.dispute.status === "ACTIVE");
  const pastDisputes = disputes.filter(d => d.dispute.status !== "ACTIVE");


  const [raiseModalTarget, setRaiseModalTarget] = useState<{ milestone: Milestone; scholar: Partial<Scholar> | null; program: { pid: number } | null } | null>(null);
  const [defendModalTarget, setDefendModalTarget] = useState<Dispute | null>(null);

  return (
    <main className="min-h-screen bg-skyellow relative isolate">
      <div
        className="absolute top-0 right-0 left-0 h-[45vh] bg-skred"
        style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 88%, 0 100%)' }}
      />
      <div className="relative z-10 max-w-6xl mx-auto px-4 md:px-6 py-10">
        <div className="mb-10 text-center md:text-left pt-8">
          <h1 className="font-paytone text-4xl md:text-6xl mb-3 text-white drop-shadow-[4px_4px_0_#000]">
            Bounty Board
          </h1>
          <p className="text-black/80 text-lg md:text-xl max-w-2xl font-medium">
            Protect the protocol. Find malicious applications or fake milestone proofs, raise a dispute, and earn rewards if they are slashed.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="font-paytone text-2xl md:text-3xl">Open Milestones</h2>
            <span className="bg-skyellow text-black px-2 py-0.5 text-[10px] font-bold uppercase border border-black">{milestones.length}</span>
          </div>
          <p className="text-xs text-gray-500 mb-4">Milestones recently submitted. Verify the proof and raise a dispute if fraudulent.</p>

          <div className="space-y-3">
            {loadingMilestones ? <NeoSkeleton lines={6} /> : milestones.length === 0 ? (
              <div className="bg-white border-2 border-black shadow-[3px_3px_0_0_#000] rounded-lg p-10 text-center">
                <p className="font-paytone text-lg mb-1">All Clear</p>
                <p className="text-gray-500 text-sm">No submitted milestones currently pending review.</p>
              </div>
            ) : (
              milestones.map((item) => {
                const { milestone } = item;
                return (
                  <NeoCard key={milestone.blockchainId}>
                    <NeoCardBody className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                      <div className="min-w-0">
                        <h4 className="font-bold text-base">Milestone <span className="font-data">#{milestone.blockchainId}</span></h4>
                        <p className="text-xs text-gray-500 mb-1 font-data">{formatShort(milestone.scholarWallet ?? "")}</p>
                        <p className="text-xs bg-gray-100 p-1.5 border border-black font-data break-all inline-block line-clamp-1 max-w-[240px]" title={milestone.proofCID}>
                          {milestone.proofCID}
                        </p>
                      </div>
                      <div className="text-right flex flex-col items-end gap-2 shrink-0">
                        <p className="font-data font-bold text-skgreen text-lg">{formatTokenAmount(milestone.amount, milestone.token)}</p>
                        <NeoButton
                          label="Raise Dispute"
                          variant="danger"
                          size="sm"
                          onClick={() => setRaiseModalTarget(item)}
                          disabled={!item.program || milestone.scholarWallet?.toLowerCase() === address?.toLowerCase()}
                        />
                      </div>
                    </NeoCardBody>
                  </NeoCard>
                );
              })
            )}
          </div>
        </section>

        <section>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="font-paytone text-2xl md:text-3xl">Active Disputes</h2>
            <span className="bg-skred text-white px-2 py-0.5 text-[10px] font-bold uppercase border border-black">{activeDisputes.length}</span>
          </div>
          <p className="text-xs text-gray-500 mb-4">{t('disputes.activeHint')}</p>

          <div className="space-y-3">
            {loadingDisputes ? <NeoSkeleton lines={6} /> : activeDisputes.length === 0 ? (
              <div className="bg-white border-2 border-black shadow-[3px_3px_0_0_#000] rounded-lg p-10 text-center">
                <p className="font-paytone text-lg mb-1">Protocol Peaceful</p>
                <p className="text-gray-500 text-sm">No active disputes at the moment.</p>
              </div>
            ) : (
              activeDisputes.map(({ dispute }) => {
                const isMyDispute = dispute.scholarAddress.toLowerCase() === address?.toLowerCase();

                return (
                  <NeoCard key={dispute.blockchainId} fill="red">
                    <NeoCardBody>
                      <div className="flex justify-between items-start mb-3 gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider border-2 border-black bg-skred text-white">{dispute.disputeType.replace(/_/g, ' ')}</span>
                            <span className="font-bold font-data">#{dispute.blockchainId}</span>
                          </div>
                          <p className="text-xs text-gray-500 font-data">BH {formatShort(dispute.bountyHunter)}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-gray-500">Potential Reward</p>
                          <p className="font-data font-bold text-skred text-lg">{formatTokenWithSymbol(dispute.potentialReward, dispute.token)}</p>
                        </div>
                      </div>

                      <div className="bg-white p-3 border-2 border-black mb-3 text-xs font-data break-all line-clamp-2 shadow-[2px_2px_0_0_#000]">
                        <span className="font-extrabold uppercase tracking-wider text-skred">Evidence:</span> {dispute.evidenceCID}
                      </div>

                      {isMyDispute ? (
                        <NeoButton
                          label="Submit Defense"
                          variant="danger"
                          fullWidth
                          onClick={() => setDefendModalTarget(dispute)}
                        />
                      ) : (
                        <ActiveDisputeActions dispute={dispute} />
                      )}
                    </NeoCardBody>
                  </NeoCard>
                );
              })
            )}
          </div>

          {pastDisputes.length > 0 && (
            <div className="mt-6 pt-6 border-t-2 border-black">
               <h3 className="font-paytone text-xl mb-3 text-gray-400">Resolved Disputes</h3>
               <div className="space-y-2">
                 {pastDisputes.map(({ dispute }) => (
                   <div key={dispute.blockchainId} className="flex justify-between items-center p-3 bg-white border-2 border-black shadow-[2px_2px_0_0_#000] text-sm">
                     <span className="font-bold font-data text-gray-600">#{dispute.blockchainId}</span>
                     <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider border-2 border-black bg-gray-100">{dispute.status.replace(/_/g, ' ')}</span>
                   </div>
                 ))}
               </div>
            </div>
          )}
        </section>
      </div>

      {raiseModalTarget && (
        <RaiseDisputeModal
          isOpen={!!raiseModalTarget}
          onClose={() => setRaiseModalTarget(null)}
          milestone={raiseModalTarget.milestone}
          programPid={raiseModalTarget.program?.pid}
        />
      )}
      
      {defendModalTarget && (
        <DefendModal 
          isOpen={!!defendModalTarget} 
          onClose={() => setDefendModalTarget(null)} 
          dispute={defendModalTarget} 
        />
      )}
      </div>
    </main>
  );
}

function ActiveDisputeActions({ dispute }: { dispute: Dispute }) {
  const { triggerAutoGuilty, isPending } = useTriggerAutoGuilty();

  const defenseDeadlinePassed =
    dispute.defenseDeadline !== null && new Date(dispute.defenseDeadline).getTime() < Date.now();
  const noCounterEvidence = !dispute.counterEvidenceCID;
  const canAutoGuilty = defenseDeadlinePassed && noCounterEvidence;

  if (canAutoGuilty) {
    return (
      <NeoButton
        label={isPending ? "Triggering…" : "Trigger Auto-Guilty"}
        variant="danger"
        fullWidth
        loading={isPending}
        disabled={isPending}
        onClick={() => triggerAutoGuilty(BigInt(dispute.blockchainId))}
      />
    );
  }

  return (
    <div className="text-center">
      <NeoButton label="Awaiting Scholar Defense" variant="ghost" disabled fullWidth />
      {dispute.defenseDeadline && (
        <p className="text-xs text-gray-500 mt-1">
          Deadline: {new Date(dispute.defenseDeadline).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}

function formatShort(address: string) {
  if (!address) return "—";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
