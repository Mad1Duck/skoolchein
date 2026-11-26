import { useState } from 'react';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import type { Program } from '@/lib/api/types';
import { ProgramCardV2 } from './ProgramCardV2';
import { useT } from '@/lib/i18n';

type Tab = {
  id: string;
  label: React.ReactNode;
  color: string;
  filter: (program: Program) => boolean;
};

interface ProgramTabsProps {
  programs: Program[];
  tabs: Tab[];
}

function TabButton({
  label,
  count,
  isActive,
  color,
  onClick,
}: {
  label: React.ReactNode;
  count: number;
  isActive: boolean;
  color: string;
  onClick: () => void;
}) {
  const baseStyle =
    'flex items-center justify-center gap-2 border-black font-normal font-paytone lg:shrink-0 lg:whitespace-nowrap lg:rounded-t-3xl lg:border-x-4 lg:border-t-4 lg:px-6 lg:text-2xl lg:max-2xl:px-4 lg:max-2xl:text-xl lg:max-xl:px-3 lg:max-xl:text-base max-lg:rounded-2xl max-lg:border-2 max-lg:px-2 max-lg:py-2 max-lg:text-sm max-sm:flex-col max-sm:gap-1 max-sm:text-xs';
  // Folder tabs on wide screens; below that a grid of buttons, so no tab is ever out of sight.
  const activeStyle = 'text-black lg:bg-skbw lg:py-6 lg:z-1 max-lg:bg-black max-lg:text-white';
  const inactiveStyle = `${color} text-black lg:border-b-4 lg:py-4`;

  return (
    <button
      type="button"
      aria-pressed={isActive}
      onClick={onClick}
      className={`${baseStyle} ${isActive ? activeStyle : inactiveStyle}`}
    >
      <span>{label}</span>
      {/* The open tab is cream like the panel, so its count carries the status colour. */}
      <span
        className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full border-2 border-black px-1.5 font-nunito text-sm font-extrabold text-black max-xl:h-6 max-xl:min-w-6 max-xl:text-xs ${isActive ? color : 'bg-white'}`}
      >
        {count}
      </span>
    </button>
  );
}

export function ProgramTabs({ programs, tabs }: ProgramTabsProps) {
  const { t } = useT();
  // Open on the first tab that has something, instead of greeting visitors with an empty one.
  const [activeTab, setActiveTab] = useState<string>(
    () => (tabs.find((tab) => programs.some(tab.filter)) ?? tabs[0])?.id ?? '',
  );
  const breakpoint = useBreakpoint();

  const activeFilter = tabs.find((t) => t.id === activeTab)?.filter;
  // Newest first.
  const filtered = (activeFilter ? programs.filter(activeFilter) : programs).slice().sort((a, b) => b.pid - a.pid);

  const size = breakpoint.isLessThan('sm') ? 'small' : 'large';

  return (
    <div className="flex flex-1 flex-col">
      <div className="relative z-10 shrink-0 lg:-left-2 lg:-top-1 lg:flex lg:items-end lg:-space-x-1 max-lg:mb-5 max-lg:grid max-lg:grid-cols-3 max-lg:gap-2">
        {tabs.map((tab) => (
          <TabButton
            key={tab.id}
            label={tab.label}
            count={programs.filter(tab.filter).length}
            color={tab.color}
            isActive={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          />
        ))}
      </div>

      <div className="flex flex-1 flex-col bg-black rounded-3xl w-full">
        <div className="relative flex flex-1 flex-col w-full bg-skbw rounded-e-3xl rounded-bl-3xl border-4 -left-2 -top-2">
          <div className={`grid flex-1 grid-cols-1 gap-5 p-5 sm:p-10 lg:grid-cols-2 lg:gap-[3.75rem] lg:p-20 ${filtered.length === 0 ? 'content-center' : 'content-start'}`}>
            {filtered.length === 0 ? (
              <div className="col-span-full text-center py-10">
                <p className="font-paytone text-2xl">{t('tabs.emptyTitle')}</p>
                <p className="text-gray-500 text-sm mt-2">
                  {t('tabs.emptyBody')}
                </p>
              </div>
            ) : (
              filtered.map((program) => (
                <ProgramCardV2
                  key={program.pid}
                  program={program}
                  // Applying has its own button on the card, shown only while applications are open.
                  labelButton={activeTab === 'vote' ? t('tabs.btnVote') : t('tabs.btnDetails')}
                  size={size}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
