import { useState } from 'react';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import type { Program } from '@/lib/api/types';
import { ProgramCardV2 } from './ProgramCardV2';
import { useT } from '@/lib/i18n';
import { FolderTabs } from '@/components/ui/FolderTabs';

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
    <FolderTabs
      tabs={tabs.map((tab) => ({ id: tab.id, label: tab.label, color: tab.color, count: programs.filter(tab.filter).length }))}
      active={activeTab}
      onChange={setActiveTab}
      bodyClassName={`grid flex-1 grid-cols-1 gap-5 p-5 sm:p-10 lg:grid-cols-2 lg:gap-[3.75rem] lg:p-20 ${filtered.length === 0 ? 'content-center' : 'content-start'}`}
    >
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
    </FolderTabs>
  );
}
