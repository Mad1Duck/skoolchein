import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
import { useTokenRate } from '@/context/token-rate-context';
import { StatusBadge } from '@/components/StatusBadge';
import { NeoButton } from '@/components/ui/NeoButton';
import { fetchProgramMeta } from '@/lib/ipfs';
import type { Program } from '@/lib/api/types';

interface ProgramCardV2Props {
  program: Program;
  labelButton?: string;
  size?: 'large' | 'small';
}

const getTextSize = (size: string, base: string, small: string) =>
  size === 'small' ? small : base;

const getImageSizeClass = (size: string) =>
  size === 'small' ? 'w-7 h-7 border' : 'w-12 h-12 border-4';

function formatUSDC(raw: string): number {
  return Number(raw) / 1_000_000;
}

function getLocalValue(amount: number, rate: number): string {
  const converted = amount * rate;
  const safeValue = Number.isFinite(converted) ? converted : 0;
  return safeValue.toLocaleString('en-US', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  });
}

function getTimeLeft(iso: string | null): string {
  if (!iso) return '00 d: 00 hr: 00 min';
  const end = new Date(iso).getTime();
  const secondsLeft = Math.floor(end / 1000) - Math.floor(Date.now() / 1000);
  if (secondsLeft <= 0) return '00 d: 00 hr: 00 min';

  const days = Math.floor(secondsLeft / 86400);
  const hours = Math.floor((secondsLeft % 86400) / 3600);
  const minutes = Math.floor((secondsLeft % 3600) / 60);

  return `${String(days).padStart(2, '0')} d: ${String(hours).padStart(2, '0')} hr: ${String(minutes).padStart(2, '0')} min`;
}

function getStatusKey(status: string): 'active' | 'vote' | 'soon' | 'done' {
  switch (status) {
    case 'APPLICATION_OPEN':
    case 'SCREENING':
    case 'ACTIVE':
      return 'active';
    case 'VOTING':
      return 'vote';
    case 'COMPLETED':
      return 'done';
    case 'CREATED':
    default:
      return 'soon';
  }
}

export function ProgramCardV2({
  program,
  labelButton = 'Apply Now',
  size = 'large',
}: ProgramCardV2Props) {
  const { address } = useAccount();
  const { rate } = useTokenRate();
  const { data: meta } = useQuery({
    queryKey: ['ipfs-meta', program.metadataCID],
    queryFn: () => fetchProgramMeta(program.metadataCID),
    enabled: !!program.metadataCID,
    staleTime: Infinity,
  });

  const deadline =
    program.status === 'VOTING'
      ? program.votingEnd
      : program.status === 'APPLICATION_OPEN' || program.status === 'SCREENING'
        ? program.applicationEnd
        : program.createdAt;

  const timeLeft = getTimeLeft(deadline);
  const status = getStatusKey(program.status);
  const fund = formatUSDC(program.totalFund);
  const initiator = program.initiator;

  return (
    <div className="flex flex-col items-center">
      <div className="bg-black rounded-3xl">
        <div className="relative -left-2 -top-2">
          <div className="inline-flex flex-col items-start rounded-3xl border bg-white">
            <div className="flex flex-col p-6 items-start gap-4">
              <div className="flex flex-col gap-4 self-stretch">
                <div className="flex items-center gap-6 justify-between">
                  <h3
                    className={`font-bold ${getTextSize(size, 'text-2xl', 'text-base')} max-w-72 truncate`}
                  >
                    {meta?.name || `Program #${program.pid}`}
                  </h3>
                  <StatusBadge status={status} size={size} />
                </div>
                <div className="flex items-center gap-2 font-bold text-sm max-w-[90%]">
                  <img src="/icons/provider-icon.svg" alt="provider-icon" />
                  <p
                    className={`${getTextSize(size, 'text-base', 'text-xs')} truncate`}
                  >
                    {size === 'small'
                      ? `${initiator.slice(0, 6)}...${initiator.slice(-4)}`
                      : initiator}
                  </p>
                </div>
              </div>

              <div
                className={`flex items-start ${size === 'small' ? 'gap-1' : 'gap-4'} self-stretch justify-between`}
              >
                <div className="flex flex-col gap-1">
                  <p className={getTextSize(size, 'text-sm', 'text-xs')}>
                    Registration close in...
                  </p>
                  <div className="flex gap-2 py-2 px-3 items-center rounded-2xl border bg-error-container border-on-error-container">
                    <img src="/icons/alarm-clock.svg" alt="clock-icon" />
                    <span
                      className={`${getTextSize(size, 'text-sm', 'text-[0.625rem]')} text-on-error-container`}
                    >
                      {timeLeft}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <p className={getTextSize(size, 'text-sm', 'text-xs')}>
                    Eligible for
                  </p>
                  <div className="flex gap-2 py-2 px-3 items-center rounded-2xl border bg-skyellow">
                    <img src="/icons/student.svg" alt="student-icon" />
                    <span
                      className={getTextSize(
                        size,
                        'text-sm',
                        'text-[0.625rem]',
                      )}
                    >
                      {program.targetWinners} Uni Students*
                    </span>
                  </div>
                  <p
                    className={`self-stretch text-right ${getTextSize(size, 'text-xs', 'text-[0.625rem]')}`}
                  >
                    *verified via PDDIKTI
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-stretch">
                <div className="flex items-center">
                  {[1, 2, 3].map((n, i) => (
                    <img
                      key={n}
                      src={`/icons/applicant${n}.png`}
                      alt={`applicant-${n}`}
                      className={`${getImageSizeClass(size)} aspect-square rounded-full ${
                        i === 0 ? 'z-[5]' : i === 1 ? '-mx-3 z-[6]' : '-mx-3 z-[4]'
                      }`}
                    />
                  ))}
                </div>
                <p className="text-sm">
                  + {program.applicantCount} other students have applied
                </p>
              </div>
            </div>

            <div className="rounded-b-3xl flex h-20 p-4 items-center gap-4 self-stretch bg-skpink">
              <div className="flex flex-col justify-end items-end gap-1">
                <div className="flex justify-end items-start gap-2">
                  <span className={getTextSize(size, 'text-sm', 'text-xs')}>
                    Total Fund:
                  </span>
                  <div
                    className={`flex flex-col items-start ${size === 'small' ? 'gap-0.5' : 'gap-1'}`}
                  >
                    <div className="flex items-center gap-0.5">
                      <span
                        className={`${getTextSize(size, 'text-2xl', 'text-base')} font-bold`}
                      >
                        {fund.toLocaleString('en-US', { maximumFractionDigits: 2 })} USDC
                      </span>
                      <p
                        className={`${getTextSize(size, 'text-sm', 'text-xs')} mx-0.5`}
                      >
                        /
                      </p>
                      <img src="/icons/student.svg" alt="student-icon" />
                    </div>
                    <div
                      className={`flex items-start gap-1 ${getTextSize(size, 'text-sm', 'text-xs')}`}
                    >
                      <img src="/icons/information-diamond.svg" alt="info" />
                      <span>worth around</span>
                      <span className="font-bold">{getLocalValue(fund, rate || 0)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div
            className={`absolute w-max ${size === 'small' ? 'top-[14rem] left-[15.5rem]' : 'top-[16.5rem] left-[20rem]'}`}
          >
            {!address ? (
              <NeoButton label="Connect Wallet" variant="connect" size="lg" />
            ) : (
              <Link to="/apply/$id" params={{ id: program.id }}>
                <button
                  className="flex relative -left-1 -top-1 font-nunito px-6 py-3 text-2xl items-center gap-2.5 rounded-lg border-solid border-black bg-skpurple text-white hover:bg-skpurple-hover active:shadow-[inset_8px_8px_8px_0_rgba(0,0,0,0.25)] transition-transform active:translate-x-1 active:translate-y-1 border-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  {labelButton}
                </button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
