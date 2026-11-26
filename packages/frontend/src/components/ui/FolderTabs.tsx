import type { ReactNode } from 'react';

export interface FolderTab<Id extends string> {
  id: Id;
  label: ReactNode;
  /** Background colour class of the closed tab and of the open tab's counter. */
  color: string;
  /** Omit to show no counter. */
  count?: number;
}

interface Props<Id extends string> {
  tabs: FolderTab<Id>[];
  active: Id;
  onChange: (id: Id) => void;
  /** `md` fits many tabs into a narrow page. */
  size?: 'lg' | 'md';
  /** Classes of the area inside the folder. */
  bodyClassName?: string;
  children: ReactNode;
}

const SIZES = {
  lg: 'lg:px-6 lg:text-2xl lg:max-2xl:px-4 lg:max-2xl:text-xl lg:max-xl:px-3 lg:max-xl:text-base',
  md: 'lg:px-5 lg:text-lg lg:max-xl:px-3 lg:max-xl:text-base',
};

/** Coloured folder tabs on wide screens; below that a grid of buttons, so no tab is ever out of sight. */
export function FolderTabs<Id extends string>({ tabs, active, onChange, size = 'lg', bodyClassName = '', children }: Props<Id>) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="relative z-10 shrink-0 lg:-left-2 lg:-top-1 lg:flex lg:items-end lg:-space-x-1 max-lg:mb-5 max-lg:grid max-lg:grid-cols-3 max-lg:gap-2">
        {tabs.map((tab) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              aria-pressed={isActive}
              onClick={() => onChange(tab.id)}
              className={`flex items-center justify-center gap-2 border-black font-normal font-paytone lg:shrink-0 lg:whitespace-nowrap lg:rounded-t-3xl lg:border-x-4 lg:border-t-4 max-lg:rounded-2xl max-lg:border-2 max-lg:px-2 max-lg:py-2 max-lg:text-sm max-sm:flex-col max-sm:gap-1 max-sm:text-xs ${SIZES[size]} ${
                isActive
                  ? `text-black lg:bg-skbw lg:z-1 max-lg:bg-black max-lg:text-white ${size === 'lg' ? 'lg:py-6' : 'lg:py-4'}`
                  : `${tab.color} text-black lg:border-b-4 ${size === 'lg' ? 'lg:py-4' : 'lg:py-2.5'}`
              }`}
            >
              <span>{tab.label}</span>
              {/* The open tab is cream like the panel, so its counter carries the tab's colour. */}
              {tab.count !== undefined && (
                <span
                  className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full border-2 border-black px-1.5 font-nunito text-sm font-extrabold text-black max-xl:h-6 max-xl:min-w-6 max-xl:text-xs ${isActive ? tab.color : 'bg-white'}`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-1 flex-col bg-black rounded-3xl w-full">
        <div className="relative flex flex-1 flex-col w-full bg-skbw rounded-e-3xl rounded-bl-3xl border-4 -left-2 -top-2">
          <div className={bodyClassName}>{children}</div>
        </div>
      </div>
    </div>
  );
}
