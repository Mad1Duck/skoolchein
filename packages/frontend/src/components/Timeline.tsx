import { formatTokenCompact } from '@/lib/contracts/v4/token';
import React, { useState, useRef } from 'react';
import { usePopper } from 'react-popper';
import { twMerge } from 'tailwind-merge';

export interface TimelineItem {
  amount: number | null;
  blockchainId: number | null;
  estimation: number | null;
  description: string | null;
  score: string | null;
  summary: string | null;
}

interface TimelineProps {
  title?: string;
  items: TimelineItem[];
  className?: string;
  /**
   * Token the item amounts are denominated in (zero address / omitted =
   * native). Required for correct scaling: native uses 18 decimals, USDC 6.
   */
  token?: string | null;
}

const Timeline: React.FC<TimelineProps> = ({ title, items, className = '', token }) => {
  const [openPopperId, setOpenPopperId] = useState<number | null>(null);
  const referenceRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const popperRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const { styles, attributes } = usePopper(
    openPopperId ? referenceRefs.current[openPopperId] : null,
    openPopperId ? popperRefs.current[openPopperId] : null,
    {
      placement: 'right', // You can change this to 'top', 'bottom', or 'left'
      modifiers: [{ name: 'offset', options: { offset: [0, 8] } }],
    },
  );

  const handleMouseEnter = (id: number) => {
    setOpenPopperId(id);
  };

  const handleMouseLeave = () => {
    setOpenPopperId(null);
  };

  return (
    <div className={`w-full max-w-md ${className}`}>
      {title && <h2 className="text-lg font-semibold text-gray-900 mb-6">{title}</h2>}

      <div className="relative">
        {items.map((item, index) => {
          const hasScore = item.score !== null && item.summary !== null;
          const isPopperOpen = openPopperId === item.blockchainId;

          return (
            <div key={item.blockchainId} className="relative flex items-center pb-6 last:pb-0">
              {index !== items.length - 1 && (
                <div className="absolute left-1 top-4 h-10 w-2 bg-gray-300" />
              )}

              <div
                ref={(el) => {
                  if (item.blockchainId) referenceRefs.current[item.blockchainId] = el;
                }}
                className={twMerge(
                  'relative z-10 w-4 h-4 rounded-full border-4 border-gray-300 bg-gray-200',
                )}
                onMouseEnter={hasScore ? () => handleMouseEnter(item.blockchainId!) : undefined}
                onMouseLeave={handleMouseLeave}
              />

              <div className="ml-4 flex-1 flex justify-between items-center">
                <div className="flex flex-col">
                  <span className={`text-sm font-bold`}>{item.description}</span>
                </div>
                <span className={`text-sm font-bold`}>
                  {formatTokenCompact(item.amount ?? 0, token)}
                </span>
              </div>

              {isPopperOpen && hasScore && (
                <div
                  ref={(el) => {
                    if (item.blockchainId) popperRefs.current[item.blockchainId] = el;
                  }}
                  style={styles.popper}
                  {...attributes.popper}
                  className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-20 text-sm"
                  onMouseEnter={() => handleMouseEnter(item.blockchainId!)}
                  onMouseLeave={handleMouseLeave}>
                  <p className="font-bold mb-1">Score: {item.score}</p>
                  <p>{item.summary}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Timeline;
