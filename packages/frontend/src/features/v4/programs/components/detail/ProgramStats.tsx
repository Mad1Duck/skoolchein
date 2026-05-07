import { StatCard } from '@/components/ui/StatCard';
import type { Program } from '@/lib/api/types';

interface ProgramStatsProps {
  program: Program;
}

function formatUSDC(raw: string | bigint): string {
  const n = typeof raw === 'bigint' ? Number(raw) / 1e6 : Number(raw) / 1e6;
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function ProgramStats({ program }: ProgramStatsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard
        label="Total Fund"
        value={`$${formatUSDC(program.totalFund)}`}
        icon="💰"
        color="green"
      />
      <StatCard
        label="Spent"
        value={`$${formatUSDC(program.spentFund)}`}
        icon="📤"
        color="orange"
      />
      <StatCard label="Applicants" value={program.applicantCount} icon="📝" color="yellow" />
      <StatCard
        label="Active Scholars"
        value={program.activeScholarCount}
        icon="🎓"
        color="purple"
      />
    </div>
  );
}
