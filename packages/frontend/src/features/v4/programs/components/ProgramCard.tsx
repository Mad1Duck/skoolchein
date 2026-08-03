import { Link } from '@tanstack/react-router';
import { NeoCard, NeoCardBody, NeoCardFooter } from '@/components/ui/NeoCard';
import { NeoBadge } from '@/components/ui/NeoBadge';
import { WalletAvatar, shortenAddress } from '@/components/ui/WalletAvatar';
import type { Program, ProgramMetadata } from '@/lib/api/types';
import { formatTokenAmount, getTokenMeta } from '@/lib/contracts/v4/token';

interface ProgramCardProps {
  program: Program;
  meta?: ProgramMetadata;
}

const fillByStatus: Record<string, 'yellow' | 'orange' | 'purple' | 'green' | 'cyan' | 'red' | 'white'> = {
  CREATED: 'cyan',
  APPLICATION_OPEN: 'yellow',
  SCREENING: 'orange',
  VOTING: 'purple',
  ACTIVE: 'green',
  COMPLETED: 'purple',
  CANCELLED: 'red',
};

/**
 * Abbreviated fund amount in the program's own token (native 18 decimals,
 * USDC 6) — the decimals must come from the token, never be hardcoded.
 */
function formatFund(raw: string, token?: string | null): string {
  const n = Number(formatTokenAmount(BigInt(raw ?? 0), token));
  const symbol = getTokenMeta(token).symbol;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M ${symbol}`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K ${symbol}`;
  return `${n.toLocaleString('en-US', { maximumFractionDigits: 4 })} ${symbol}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function ProgramCard({ program, meta }: ProgramCardProps) {
  const fill = fillByStatus[program.status] ?? 'white';

  return (
    <Link to="/programs/$id" params={{ id: String(program.pid) }} preload="intent" className="block h-full">
      <NeoCard fill={fill} className="h-full flex flex-col">
        <NeoCardBody className="flex-1 space-y-3.5">
          {/* Header: badge + id */}
          <div className="flex items-start justify-between gap-2">
            <NeoBadge status={program.status} />
            <span className="text-[10px] font-extrabold text-gray-400 uppercase font-data tracking-wider">
              #{program.pid}
            </span>
          </div>

          {/* Title */}
          <h3 className="font-paytone text-xl leading-[1.05] line-clamp-2">
            {meta?.name ?? `Program #${program.pid}`}
          </h3>

          {/* Description */}
          {meta?.description && (
            <p className="text-sm text-gray-600 line-clamp-2 leading-relaxed">{meta.description}</p>
          )}

          {/* Initiator */}
          <div className="flex items-center gap-2 pt-1">
            <WalletAvatar address={program.initiator} size={22} />
            <span className="text-[11px] font-data text-gray-500">
              {shortenAddress(program.initiator)}
            </span>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2 pt-3 border-t-2 border-black/10">
            <div>
              <p className="text-base font-data font-bold leading-tight">{formatFund(program.totalFund, program.token)}</p>
              <p className="text-[9px] font-extrabold uppercase text-gray-500 tracking-widest mt-0.5">Fund</p>
            </div>
            <div>
              <p className="text-base font-data font-bold leading-tight">{program.applicantCount}</p>
              <p className="text-[9px] font-extrabold uppercase text-gray-500 tracking-widest mt-0.5">Applicants</p>
            </div>
            <div>
              <p className="text-base font-data font-bold leading-tight">{program.targetWinners}</p>
              <p className="text-[9px] font-extrabold uppercase text-gray-500 tracking-widest mt-0.5">Winners</p>
            </div>
          </div>
        </NeoCardBody>

        <NeoCardFooter className="flex items-center justify-between text-xs">
          <span className="text-gray-500 font-medium">
            {program.status === 'APPLICATION_OPEN'
              ? `Closes ${formatDate(program.applicationEnd)}`
              : program.status === 'VOTING'
                ? `Vote until ${formatDate(program.votingEnd)}`
                : `Created ${formatDate(program.createdAt)}`}
          </span>
          <span className="font-bold text-skpurple text-sm">View →</span>
        </NeoCardFooter>
      </NeoCard>
    </Link>
  );
}
