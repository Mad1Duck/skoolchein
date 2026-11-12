import { useAccount, useBalance } from 'wagmi';
import { useDashboard } from '@/lib/api/hooks';
import { useActiveChain } from '@/lib/chain/useActiveChain';
import { usdcAddress } from '@/lib/chain/chains';
import { NeoSkeleton } from '@/components/ui/NeoSkeleton';
import { StatCard } from '@/components/ui/StatCard';
import { formatUnits } from 'viem';
import { Link } from '@tanstack/react-router';

import {
  InitiatorPanel,
  StudentPanel,
  VoterPanel,
  BountyHunterPanel,
  CommitteePanel,
} from '../components/Panels';
import { CreateProgramModal } from '../../programs/components/CreateProgramModal';
import { useState, useMemo } from 'react';
import { NeoButton } from '@/components/ui/NeoButton';
import { LiveBadge } from '@/components/ui/LiveBadge';
import { ProviderProfileCard } from '../components/ProviderProfileCard';
import { ProgramSwitcher } from '../components/ProgramSwitcher';
import { StudentProfileCard } from '../components/StudentProfileCard';
import { DashboardMessageCard } from '../components/DashboardMessageCard';
import { DashboardNftCollections } from '../components/DashboardNftCollections';
import { ProviderMilestonesPanel } from '../components/ProviderMilestonesPanel';
import { useT } from '@/lib/i18n';
import type { TranslationKey } from '@/lib/i18n/en';
import {
  DashboardTabs,
  DashboardTabsList,
  DashboardTabsTrigger,
  DashboardTabsContent,
} from '../components/DashboardTabs';

const arc = `polygon(
  100% 0, 0 0, 0 100%, 5% 94%, 10% 92%, 15% 90%, 20% 89%, 25% 88%,
  30% 87%, 35% 86%, 40% 85%, 45% 84.5%, 50% 84%, 55% 84.5%, 60% 85%,
  65% 86%, 70% 87%, 75% 88%, 80% 89%, 85% 91%, 90% 93%, 95% 96%, 100% 100%
)`;

const PUBLIC_CARDS = [
  {
    title: 'dash.c1.title' as const,
    subtitle: 'dash.c1.subtitle' as const,
    description: 'dash.c1.desc' as const,
    cta: 'dash.c1.cta' as const,
    href: '/programs',
    image: '/img/scholarships-left.svg',
    color: 'bg-skcream',
  },
  {
    title: 'dash.c2.title' as const,
    subtitle: 'dash.c2.subtitle' as const,
    description: 'dash.c2.desc' as const,
    cta: 'dash.c2.cta' as const,
    href: '/programs',
    image: '/img/scholarships-right.svg',
    color: 'bg-skyellow',
  },
  {
    title: 'dash.c3.title' as const,
    subtitle: 'dash.c3.subtitle' as const,
    description: 'dash.c3.desc' as const,
    cta: 'dash.c3.cta' as const,
    href: undefined,
    image: '/img/milestone-plan.svg',
    color: 'bg-skcream',
  },
];

function PublicView() {
  const { t } = useT();
  return (
    <main className="flex flex-col px-9 pb-9 w-full min-h-screen relative isolate bg-skyellow">
      <div
        className="h-[60vh] absolute right-0 left-0 -top-px bg-skpurple"
        style={{ clipPath: arc }}
      />
      <div className="relative z-10 max-w-6xl mx-auto w-full pt-12 md:pt-20">
        <div className="text-center mb-12 md:mb-16">
          <h1 className="font-paytone text-4xl md:text-6xl text-black mb-3">
            {t('dash.emptyTitle')}
          </h1>
          <p className="text-lg md:text-xl text-black/80 max-w-2xl mx-auto">
            {t('dash.emptyBody')}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          {PUBLIC_CARDS.map((card) => (
            <div
              key={card.title}
              className={`${card.color} border-2 border-black rounded-3xl shadow-[4px_4px_0_0_#000] p-6 flex flex-col`}
            >
              <div className="flex-1 flex items-center justify-center mb-6">
                <img src={card.image} alt={card.title} className="h-32 w-auto object-contain" />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-bold uppercase tracking-wider text-gray-700">{t(card.title)}</p>
                <h3 className="font-paytone text-2xl md:text-3xl leading-tight">{t(card.subtitle)}</h3>
                <p className="text-sm text-gray-600">{t(card.description)}</p>
              </div>
              {card.href ? (
                <Link to={card.href} className="mt-6">
                  <NeoButton label={t(card.cta)} variant="primary" size="md" fullWidth />
                </Link>
              ) : (
                <div className="mt-6">
                  <NeoButton label={t(card.cta)} variant="connect" size="md" fullWidth />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

export function DashboardPage() {
  const { t } = useT();
  const { chainId } = useActiveChain();
  const { address } = useAccount();
  const { data: dashboard, isLoading } = useDashboard(address || '');
  const { data: usdcBalance } = useBalance({
    chainId,
    address,
    token: usdcAddress(chainId),
  });
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [activeView, setActiveView] = useState<'provider' | 'student'>('provider');
  const [selectedPid, setSelectedPid] = useState<number | undefined>();
  const [scholarshipIndex, setScholarshipIndex] = useState(0);

  // ── Committee membership detection ───────────────────────────────────────────
  const committeeProgramIds = useMemo(
    () => (dashboard?.committeePrograms ?? []).map((p) => p.pid),
    [dashboard?.committeePrograms],
  );

  // ── Public view when no wallet ───────────────────────────────────────────────
  if (!address) {
    return <PublicView />;
  }

  if (isLoading) {
    return (
      <main className="flex px-9 pb-9 w-full min-h-screen relative isolate bg-skyellow">
        <div
          className="h-[60vh] absolute right-0 left-0 -top-px bg-skpurple"
          style={{ clipPath: arc }}
        />
        <div className="relative z-10 p-10 max-w-6xl mx-auto">
          <NeoSkeleton lines={8} />
        </div>
      </main>
    );
  }

  if (!dashboard) {
    return <PublicView />;
  }

  const { summary, programsCreated, scholarships, votes, stakes, disputes, reputation } = dashboard;

  const roles: string[] = [];
  if (programsCreated.length > 0) roles.push('INITIATOR');
  if (scholarships.length > 0) roles.push('SCHOLAR');
  if (votes.length > 0 || stakes.length > 0) roles.push('VOTER');
  if (disputes.length > 0) roles.push('BOUNTY_HUNTER');
  if (committeeProgramIds.length > 0) roles.push('COMMITTEE');

  const roleFills: Record<string, string> = {
    INITIATOR: 'bg-skpink text-black',
    SCHOLAR: 'bg-skcyan text-black',
    VOTER: 'bg-skpurple text-white',
    BOUNTY_HUNTER: 'bg-skgreen text-black',
    COMMITTEE: 'bg-skyellow text-black',
  };

  const isProvider = programsCreated.length > 0;
  const isStudent = scholarships.length > 0;
  // With only one role there is nothing to switch between, so that view is simply shown.
  const view = isProvider && !isStudent ? 'provider' : isStudent && !isProvider ? 'student' : activeView;

  // Falls back to the first program until one is picked (or if the picked one disappears).
  const selectedProgram = programsCreated.find((p) => p.pid === selectedPid) ?? programsCreated[0];
  const selectedScholarship = scholarships[scholarshipIndex];

  const nextScholarship = () => setScholarshipIndex((i) => (i + 1) % scholarships.length);

  return (
    <main className="flex flex-col px-9 pb-9 w-full min-h-screen relative isolate bg-skyellow">
      <div
        className="h-[60vh] absolute right-0 left-0 -top-px bg-skpurple"
        style={{ clipPath: arc }}
      />
      <div className="relative z-10 max-w-6xl mx-auto w-full py-10 md:py-14">
        {/* Role Identity Banner */}
        <div className="border-2 border-black bg-white shadow-[4px_4px_0_0_#000] rounded-lg p-5 md:p-6 mb-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {roles.map((r) => (
                  <span
                    key={r}
                    className={`px-2 py-1 ${roleFills[r] ?? 'bg-gray-100 text-black'} border-2 border-black text-[10px] font-extrabold uppercase tracking-widest`}
                  >
                    {t(`role.${r}` as TranslationKey)}
                  </span>
                ))}
                {roles.length === 0 && (
                  <span className="px-2 py-1 bg-gray-100 text-black border-2 border-black text-[10px] font-extrabold uppercase tracking-widest">
                    {t('role.NEWCOMER')}
                  </span>
                )}
              </div>
              <h1 className="font-paytone text-3xl md:text-5xl leading-[0.95]">{t('nav.dashboard')}</h1>
            </div>
            <div className="flex flex-col items-start md:items-end gap-1">
              <div className="flex items-center gap-2">
                <LiveBadge />
                <p className="text-xs font-data text-gray-400 uppercase tracking-widest">{t('dash.connected')}</p>
              </div>
              <p className="text-sm font-data text-gray-600">{address}</p>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
          <StatCard
            label={t('dash.statRep')}
            value={
              reputation
                ? Number(formatUnits(BigInt(reputation.repBalance), 18)).toFixed(2)
                : '0'
            }
            color="purple"
          />
          <StatCard
            label={t('dash.statUsdc')}
            value={usdcBalance ? Number(formatUnits(usdcBalance.value, 6)).toFixed(2) : '0'}
            color="yellow"
          />
          <StatCard label={t('dash.statScholarships')} value={summary.scholarshipsCount.toString()} color="green" />
          <StatCard label={t('dash.statVotes')} value={summary.votesCount.toString()} color="cyan" />
          <StatCard label={t('dash.statReports')} value={summary.disputesCount.toString()} color="red" />
        </div>

        {/* Provider / Student switcher */}
        {isProvider && isStudent && (
          <div className="flex gap-2 mb-8">
            {isProvider && (
              <button
                type="button"
                onClick={() => setActiveView('provider')}
                className={`px-4 py-2 rounded-lg border-2 border-black font-bold transition-all ${
                  view === 'provider'
                    ? 'bg-skpink shadow-[2px_2px_0_0_#000]'
                    : 'bg-white hover:bg-skpink/50'
                }`}
              >
                {t('dash.viewProvider')}
              </button>
            )}
            {isStudent && (
              <button
                type="button"
                onClick={() => setActiveView('student')}
                className={`px-4 py-2 rounded-lg border-2 border-black font-bold transition-all ${
                  view === 'student'
                    ? 'bg-skcyan shadow-[2px_2px_0_0_#000]'
                    : 'bg-white hover:bg-skcyan/50'
                }`}
              >
                {t('dash.viewStudent')}
              </button>
            )}
          </div>
        )}

        {/* Two-column layout */}
        {view === 'provider' && isProvider && (
          <>
          <div className="mb-6">
            <ProgramSwitcher
              programs={programsCreated}
              selectedPid={selectedProgram?.pid}
              onSelect={setSelectedPid}
            />
          </div>
          <div className="flex flex-col lg:flex-row gap-8 mb-12">
            <div className="lg:w-[24rem] lg:shrink-0 min-w-0 space-y-6 w-full">
              <ProviderProfileCard
                program={selectedProgram}
                isLoading={false}
              />
              <DashboardMessageCard
                sender={address}
                message="Hi, Ms., Please approve my last milestone submission. Have a nice day!"
              />
            </div>
            <DashboardTabs defaultValue="milestones" className="grow min-w-0">
              <DashboardTabsList>
                <DashboardTabsTrigger value="milestones" className="bg-skpink">
                  {t('dash.tabMilestones')}
                </DashboardTabsTrigger>
                <DashboardTabsTrigger value="programs" className="bg-skcyan">
                  {t('dash.tabPrograms')}
                </DashboardTabsTrigger>
                <DashboardTabsTrigger value="achievements" className="bg-skyellow">
                  {t('dash.tabAchievements')}
                </DashboardTabsTrigger>
              </DashboardTabsList>
              <DashboardTabsContent value="milestones">
                <ProviderMilestonesPanel
                  program={selectedProgram}
                  milestones={dashboard.milestones}
                  isLoading={false}
                />
              </DashboardTabsContent>
              <DashboardTabsContent value="programs">
                <InitiatorPanel
                  programs={selectedProgram ? [selectedProgram] : []}
                  onOpenCreateModal={() => setIsCreateModalOpen(true)}
                  hideHeading
                />
              </DashboardTabsContent>
              <DashboardTabsContent value="achievements">
                <div className="w-full overflow-auto pr-2">
                  <DashboardNftCollections
                    address={address}
                    dashboard={dashboard}
                    variant="provider"
                  />
                </div>
              </DashboardTabsContent>
            </DashboardTabs>
          </div>
          </>
        )}

        {view === 'student' && isStudent && (
          <div className="flex flex-col lg:flex-row gap-8 mb-12">
            <div className="lg:w-[24rem] lg:shrink-0 min-w-0 space-y-6 w-full">
              <StudentProfileCard
                scholar={selectedScholarship?.scholar}
                program={selectedScholarship?.program}
                isLoading={false}
                onNext={nextScholarship}
              />
              <DashboardMessageCard
                sender={selectedScholarship?.program?.initiator ?? address}
                message={`Keep creating and keep believing, Scholar. You’ve got talent—this is just the beginning. 💫`}
              />
            </div>
            <DashboardTabs defaultValue="milestones" className="grow min-w-0">
              <DashboardTabsList>
                <DashboardTabsTrigger value="milestones" className="bg-skpink">
                  {t('dash.tabMilestones')}
                </DashboardTabsTrigger>
                <DashboardTabsTrigger value="achievements" className="bg-skyellow">
                  {t('dash.tabAchievements')}
                </DashboardTabsTrigger>
              </DashboardTabsList>
              <DashboardTabsContent value="milestones">
                <StudentPanel scholarships={scholarships} dashboardData={dashboard} />
              </DashboardTabsContent>
              <DashboardTabsContent value="achievements">
                <div className="w-full overflow-auto pr-2">
                  <DashboardNftCollections
                    address={address}
                    dashboard={dashboard}
                    variant="student"
                  />
                </div>
              </DashboardTabsContent>
            </DashboardTabs>
          </div>
        )}

        {/* Other role panels */}
        <div className="space-y-10">
          <VoterPanel votes={votes} stakes={stakes} dashboardData={dashboard} />
          <BountyHunterPanel disputes={disputes} />
          <CommitteePanel
            programIds={committeeProgramIds}
            dashboardData={dashboard}
            address={address}
          />
        </div>
      </div>

      <CreateProgramModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />
    </main>
  );
}
