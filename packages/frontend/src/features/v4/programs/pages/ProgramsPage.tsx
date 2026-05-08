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
      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="px-4 md:px-6 pt-10 pb-12 border-b-2 border-black bg-white">
        <div className="max-w-5xl mx-auto">
          <h1 className="font-paytone text-4xl md:text-5xl mb-3">
            Empower the Future
          </h1>
          <p className="text-lg md:text-xl text-gray-700 max-w-2xl mb-6">
            Transparent scholarships powered by smart contracts.
            Funds go directly to students.
          </p>
          <NeoButton
            label="Create New Program"
            variant="primary"
            size="lg"
            onClick={() => setIsCreateModalOpen(true)}
          />
        </div>
      </section>

      {/* ── Programs ───────────────────────────────────────────────────────── */}
      <section id="programs" className="px-4 md:px-6 py-10 bg-skyellow border-b-2 border-black">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6">
            <h2 className="font-paytone text-3xl md:text-4xl">Find a Program</h2>
          </div>

          {/* Filter tabs */}
          <div className="flex flex-wrap gap-2 mb-6">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={`
                  px-3 py-1.5 rounded-md border-2 border-black font-bold text-sm
                  transition-all duration-100
                  ${
                    activeTab === tab.value
                      ? 'bg-black text-white shadow-none translate-x-[2px] translate-y-[2px]'
                      : 'bg-white text-black shadow-[3px_3px_0_0_#000] hover:translate-x-[3px] hover:translate-y-[3px] hover:shadow-none'
                  }
                `}>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Program grid */}
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <NeoCardSkeleton key={i} />
              ))}
            </div>
          ) : programs.length === 0 ? (
            <div className="bg-white border-2 border-black shadow-[3px_3px_0_0_#000] rounded-md p-10 text-center">
              <p className="font-paytone text-xl mb-2">No programs found</p>
              <p className="text-gray-600 text-sm">Try a different filter or create a new program.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
