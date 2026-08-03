import { StatCard } from '@/components/ui/StatCard';
import type { Program } from '@/lib/api/types';
import { formatTokenCompact } from '@/lib/contracts/v4/token';

interface ProgramStatsProps {
  program: Program;
}

export function ProgramStats({ program }: ProgramStatsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard label="Total Fund" value={formatTokenCompact(program.totalFund, program.token)} color="green" />
      <StatCard label="Spent" value={formatTokenCompact(program.spentFund, program.token)} color="orange" />
      <StatCard label="Applicants" value={program.applicantCount} color="yellow" />
      <StatCard label="Active Scholars" value={program.activeScholarCount} color="purple" />
    </div>
  );
}
