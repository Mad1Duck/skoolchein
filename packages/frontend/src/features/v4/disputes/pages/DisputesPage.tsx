import { useState } from "react";
import { useAccount } from "wagmi";
import { formatUnits } from "viem";
import { useDisputes, useMilestones } from "@/lib/api/hooks";
import { useTriggerAutoGuilty } from "@/lib/contracts/write-hooks";
import { NeoCard, NeoCardBody } from "@/components/ui/NeoCard";
import { NeoButton } from "@/components/ui/NeoButton";
import { NeoSkeleton } from "@/components/ui/NeoSkeleton";
import { RaiseDisputeModal } from "../components/RaiseDisputeModal";
import { DefendModal } from "../components/DefendModal";
import type { Milestone, Dispute } from "@/lib/api/types";

export function DisputesPage() {
  const { address } = useAccount();

  // Queries
  const { data: disputesRes, isLoading: loadingDisputes } = useDisputes();
  const { data: milestonesData, isLoading: loadingMilestones } = useMilestones({ status: "SUBMITTED" });

  const disputes = disputesRes?.data ?? [];
  const milestones = milestonesData ?? [];

  // Active Disputes
  const activeDisputes = disputes.filter(d => d.dispute.status === "ACTIVE");
  const pastDisputes = disputes.filter(d => d.dispute.status !== "ACTIVE");


  const [raiseModalTarget, setRaiseModalTarget] = useState<Milestone | null>(null);
  const [defendModalTarget, setDefendModalTarget] = useState<Dispute | null>(null);

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-10">
      <div className="mb-8">
        <h1 className="font-paytone text-4xl md:text-5xl mb-2 text-skred">Bounty Board</h1>
        <p className="text-gray-600 text-base md:text-lg max-w-2xl">
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
              <div className="bg-white border-2 border-black shadow-[3px_3px_0_0_#000] rounded-md p-8 text-center">
                <p className="font-bold text-gray-500">All clear. No submitted milestones currently pending review.</p>
              </div>
            ) : (
              milestones.map(({ milestone }) => (
                <NeoCard key={milestone.id}>
                  <NeoCardBody className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                    <div className="min-w-0">
                      <h4 className="font-bold text-base">Milestone <span className="font-data">#{milestone.blockchainId}</span></h4>
                      <p className="text-xs text-gray-500 mb-1 font-data">{formatShort(milestone.scholarWallet)}</p>
                      <p className="text-xs bg-gray-100 p-1.5 border border-black font-data break-all inline-block line-clamp-1 max-w-[240px]" title={milestone.proofCID}>
                        {milestone.proofCID}
                      </p>
                    </div>
                    <div className="text-right flex flex-col items-end gap-2 shrink-0">
                      <p className="font-data font-bold text-skgreen text-lg">${formatUnits(BigInt(milestone.amount), 6)}</p>
                      <NeoButton
                        label="Raise Dispute"
                        variant="danger"
                        size="sm"
                        onClick={() => setRaiseModalTarget(milestone)}
                        disabled={milestone.scholarWallet.toLowerCase() === address?.toLowerCase()}
                      />
                    </div>
                  </NeoCardBody>
                </NeoCard>
              ))
            )}
          </div>
        </section>

        <section>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="font-paytone text-2xl md:text-3xl">Active Disputes</h2>
            <span className="bg-skred text-white px-2 py-0.5 text-[10px] font-bold uppercase border border-black">{activeDisputes.length}</span>
          </div>
          <p className="text-xs text-gray-500 mb-4">Disputes requiring a defense from the scholar, or awaiting oracle resolution.</p>

          <div className="space-y-3">
            {loadingDisputes ? <NeoSkeleton lines={6} /> : activeDisputes.length === 0 ? (
              <div className="bg-white border-2 border-black shadow-[3px_3px_0_0_#000] rounded-md p-8 text-center">
                <p className="font-bold text-gray-500">No active disputes. The protocol is peaceful.</p>
              </div>
            ) : (
              activeDisputes.map(({ dispute }) => {
                const isMyDispute = dispute.scholarAddress.toLowerCase() === address?.toLowerCase();

                return (
                  <NeoCard key={dispute.id} accent="red">
                    <NeoCardBody>
                      <div className="flex justify-between items-start mb-3 gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="bg-skred text-white px-2 py-0.5 text-[10px] font-bold uppercase">{dispute.disputeType}</span>
                            <span className="font-bold font-data">#{dispute.blockchainId}</span>
                          </div>
                          <p className="text-xs text-gray-500 font-data">BH {formatShort(dispute.bountyHunter)}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-gray-500">Potential Reward</p>
                          <p className="font-data font-bold text-skred text-lg">{formatUnits(BigInt(dispute.potentialReward), 6)} USDC</p>
                        </div>
                      </div>

                      <div className="bg-red-50 p-2 border-2 border-red-200 mb-3 text-xs font-data break-all line-clamp-2">
                        <span className="font-bold text-red-800">Evidence:</span> {dispute.evidenceCID}
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
                   <div key={dispute.id} className="flex justify-between p-3 bg-gray-50 border-2 border-gray-200 text-sm">
                     <span className="font-bold font-data text-gray-600">#{dispute.blockchainId}</span>
                     <span className="font-bold">{dispute.status.replace("_", " ")}</span>
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
          milestone={raiseModalTarget} 
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
