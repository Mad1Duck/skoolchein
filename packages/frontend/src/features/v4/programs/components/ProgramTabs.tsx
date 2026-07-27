import { useState } from 'react';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import type { Program } from '@/lib/api/types';
import { ProgramCardV2 } from './ProgramCardV2';

type Tab = {
  id: string;
  label: React.ReactNode;
  color: string;
  filter?: (program: Program) => boolean;
};

interface ProgramTabsProps {
  programs: Program[];
  tabs: Tab[];
}

function TabButton({
  label,
  isActive,
  color,
  onClick,
}: {
  label: React.ReactNode;
  isActive: boolean;
  color: string;
  onClick: () => void;
}) {
  const baseStyle =
    'gap-[0.625rem] items-end rounded-t-3xl px-6 text-2xl font-normal border-l-4 border-t-4 border-r-4 border-black text-black font-paytone max-sm:text-sm';
  const activeStyle = 'bg-skbw py-6 max-sm:py-4 max-sm:pb-6 z-1';
  const inactiveStyle = `${color} border-b-4 py-4`;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${baseStyle} ${isActive ? activeStyle : inactiveStyle}`}
    >
      {label}
    </button>
  );
}

export function ProgramTabs({ programs, tabs }: ProgramTabsProps) {
  const [activeTab, setActiveTab] = useState<string>(tabs[0]?.id ?? '');
  const breakpoint = useBreakpoint();

  const activeFilter = tabs.find((t) => t.id === activeTab)?.filter;
  const filtered = activeFilter ? programs.filter(activeFilter) : programs;

  const size = breakpoint.isLessThan('sm') ? 'small' : 'large';

  return (
    <div className="grow">
      <div className="relative -left-2 -top-1 shrink-0 z-10 flex items-end -space-x-1 max-sm:-space-x-2">
        {tabs.map((tab) => (
          <TabButton
            key={tab.id}
            label={tab.label}
            color={tab.color}
            isActive={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          />
        ))}
      </div>

      <div className="shrink-0 bg-black rounded-3xl w-full">
        <div className="relative w-full bg-skbw rounded-e-3xl rounded-bl-3xl border-4 -left-2 -top-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-[3.75rem] p-20 max-sm:p-5 max-sm:gap-5">
            {filtered.length === 0 ? (
              <div className="col-span-full text-center py-10">
                <p className="font-paytone text-2xl">No scholarships here yet</p>
                <p className="text-gray-500 text-sm mt-2">
                  Check another tab or create a new program.
                </p>
              </div>
            ) : (
              filtered.map((program) => (
                <ProgramCardV2
                  key={program.pid}
                  program={program}
                  labelButton={
                    activeTab === 'vote'
                      ? 'Vote Now'
                      : activeTab === 'soon'
                        ? 'Details'
                        : 'Apply Now'
                  }
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
