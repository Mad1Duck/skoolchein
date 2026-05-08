import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePrograms } from '@/lib/api/hooks';
import { fetchProgramMeta } from '@/lib/ipfs';
import { useSSE } from '@/lib/sse/useSSE';
import type { Program, ProgramStatus } from '@/lib/api/types';
import { ProgramCard } from '../components/ProgramCard';
import { NeoCardSkeleton } from '@/components/ui/NeoSkeleton';
import { NeoButton } from '@/components/ui/NeoButton';
import { CreateProgramModal } from '../components/CreateProgramModal';

const STATUS_TABS: Array<{ label: string; value: ProgramStatus | 'ALL' }> = [
  { label: 'All', value: 'ALL' },
  { label: 'Open', value: 'APPLICATION_OPEN' },
  { label: 'Screening', value: 'SCREENING' },
  { label: 'Voting', value: 'VOTING' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Completed', value: 'COMPLETED' },
];

export function ProgramsPage() {
  const [activeTab, setActiveTab] = useState<ProgramStatus | 'ALL'>('ALL');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // SSE for real-time updates
  const { data: sseEvent } = useSSE<{ step: string }>({
    url: `${import.meta.env.VITE_BACKEND_HOST}/sse`,
    event: 'main',
  });

  // Fetch programs
  const {
    data: result,
    isLoading,
    refetch,
  } = usePrograms(activeTab === 'ALL' ? undefined : { status: activeTab });

  // Refetch on SSE events
  useEffect(() => {
    if (sseEvent?.step === 'ProgramCreated' || sseEvent?.step === 'ProgramStatusChanged') {
      refetch();
    }
  }, [sseEvent, refetch]);

  const programs = result?.data ?? [];

  return (
    <div className="w-full">
      {/* ── Hero: asymmetric, editorial ──────────────────────────────────────── */}
      <section className="px-4 md:px-8 lg:px-12 pt-12 md:pt-16 pb-14 md:pb-20 border-b-2 border-black bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div className="max-w-xl">
              <span className="inline-block px-2 py-1 bg-skyellow border-2 border-black text-[10px] font-extrabold uppercase tracking-widest mb-4">
                Scholarship Protocol v4
              </span>
              <h1 className="font-paytone text-4xl md:text-6xl leading-[0.95] mb-4">
                Empower<br />the Future
              </h1>
              <p className="text-base md:text-lg text-gray-600 leading-relaxed max-w-md">
                Transparent, on-chain scholarships. Funds flow directly to verified students with committee oversight.
              </p>
            </div>
            <div className="shrink-0">
              <NeoButton
                label="Create Program"
                variant="primary"
                size="lg"
                onClick={() => setIsCreateModalOpen(true)}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Programs grid ───────────────────────────────────────────────────── */}
      <section id="programs" className="px-4 md:px-8 lg:px-12 py-10 md:py-14 bg-skcream border-b-2 border-black">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
            <div>
              <h2 className="font-paytone text-2xl md:text-3xl">All Programs</h2>
              <p className="text-sm text-gray-500 mt-1">{programs.length} program{programs.length !== 1 ? 's' : ''} available</p>
            </div>

            {/* Filter tabs */}
            <div className="flex flex-wrap gap-2">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setActiveTab(tab.value)}
                  className={`
                    px-3 py-1.5 border-2 border-black font-bold text-xs uppercase tracking-wider
                    transition-all duration-75
                    ${
                      activeTab === tab.value
                        ? 'bg-black text-white shadow-none translate-x-[2px] translate-y-[2px]'
                        : 'bg-white text-black shadow-[2px_2px_0_0_#000] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_0_#000]'
                    }
                  `}>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Program grid */}
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <NeoCardSkeleton key={i} />
              ))}
            </div>
          ) : programs.length === 0 ? (
            <div className="bg-white border-2 border-black shadow-[3px_3px_0_0_#000] rounded-lg p-12 text-center">
              <p className="font-paytone text-2xl mb-2">No programs found</p>
              <p className="text-gray-500 text-sm mb-6">Adjust your filters or start something new.</p>
              <NeoButton
                label="Create Program"
                variant="secondary"
                size="md"
                onClick={() => setIsCreateModalOpen(true)}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {programs.map((program) => (
                <ProgramCardWithMeta key={program.id} program={program} />
              ))}
            </div>
          )}
        </div>
      </section>

      <CreateProgramModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} />
    </div>
  );
}

/** Program card that fetches IPFS metadata */
function ProgramCardWithMeta({ program }: { program: Program }) {
  const { data: meta } = useQuery({
    queryKey: ['ipfs-meta', program.metadataCID],
    queryFn: () => fetchProgramMeta(program.metadataCID),
    enabled: !!program.metadataCID,
    staleTime: Infinity,
  });

  return <ProgramCard program={program} meta={meta ?? undefined} />;
}
