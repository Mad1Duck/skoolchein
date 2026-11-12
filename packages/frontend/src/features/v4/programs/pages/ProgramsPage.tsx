import { useState, useEffect, memo } from 'react';
import { usePrograms } from '@/lib/api/hooks';
import { useSSE } from '@/lib/sse/useSSE';
import { useActiveChain } from '@/lib/chain/useActiveChain';
import type { Program } from '@/lib/api/types';
import { NeoButton } from '@/components/ui/NeoButton';
import { CreateProgramModal } from '../components/CreateProgramModal';
import { ProgramTabs } from '../components/ProgramTabs';
import SplitText from '@/components/ui/split-text';
import { ApproachableWrapper } from '@/components/ornaments/ApproachableWrapper';
import { useT } from '@/lib/i18n';
import type { TranslationKey } from '@/lib/i18n/en';

const messageKeys = ['home.msg1', 'home.msg2'] as const;

const getTabs = (t: (key: TranslationKey) => string) => [
  {
    id: 'active',
    label: (
      <span>
        {t('tabs.active')} <span className="max-sm:sr-only">{t('tabs.activeMore')}</span>
      </span>
    ),
    color: 'bg-skpurple',
    filter: (p: Program) =>
      p.status === 'APPLICATION_OPEN' || p.status === 'SCREENING' || p.status === 'ACTIVE',
  },
  {
    id: 'vote',
    label: t('tabs.vote'),
    color: 'bg-skred',
    filter: (p: Program) => p.status === 'VOTING',
  },
  {
    id: 'soon',
    label: t('tabs.soon'),
    color: 'bg-skgreen',
    filter: (p: Program) => p.status === 'CREATED',
  },
];

const Title = memo(function Title() {
  const { t } = useT();
  return (
    <div className="z-[20] max-lg:text-4xl max-sm:text-[32px]">
      <h1>
        <SplitText
          text={t('home.t1')}
          delay={200}
          duration={0.6}
          ease="power3.out"
          splitType="words"
          from={{ opacity: 0, y: 40 }}
          to={{ opacity: 1, y: 0 }}
          threshold={0.1}
          rootMargin="-100px"
          textAlign="center"
        />
      </h1>
      <h1>
        <SplitText
          text={t('home.t2')}
          delay={200}
          duration={0.6}
          ease="power3.out"
          splitType="words"
          from={{ opacity: 0, y: 40 }}
          to={{ opacity: 1, y: 0 }}
          threshold={0.1}
          rootMargin="-99px"
          textAlign="center"
        />
      </h1>
      <div className="font-nunito text-2xl max-sm:text-sm">
        <SplitText
          text={t('home.t3')}
          delay={50}
          duration={0.6}
          ease="power3.out"
          splitType="words"
          from={{ opacity: 0, y: 40 }}
          to={{ opacity: 1, y: 0 }}
          threshold={0.1}
          rootMargin="-100px"
          textAlign="center"
        />
        <br />
        <SplitText
          text={t('home.t4')}
          delay={50}
          duration={0.6}
          ease="power3.out"
          splitType="words"
          from={{ opacity: 0, y: 40 }}
          to={{ opacity: 1, y: 0 }}
          threshold={0.1}
          rootMargin="-100px"
          textAlign="center"
        />
      </div>
    </div>
  );
});

export function ProgramsPage() {
  const { t } = useT();
  const { chainId } = useActiveChain();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [messagesIndex, setMessagesIndex] = useState(0);
  const [prevMessagesIndex, setPrevMessagesIndex] = useState<number | null>(null);

  const { data: sseEvent } = useSSE<{ step: string; chainId?: number }>({
    url: `${import.meta.env.VITE_BACKEND_HOST}/sse`,
    event: 'main',
  });

  const { data: result, isLoading, refetch } = usePrograms();
  const programs = result?.data ?? [];

  useEffect(() => {
    // Events carry the chain they came from; ignore other chains (older events without one still match).
    if (sseEvent?.chainId !== undefined && sseEvent.chainId !== chainId) return;
    if (sseEvent?.step === 'ProgramCreated' || sseEvent?.step === 'ProgramStatusChanged') {
      refetch();
    }
  }, [sseEvent, refetch, chainId]);

  useEffect(() => {
    const interval = setInterval(() => {
      setPrevMessagesIndex(messagesIndex);
      setMessagesIndex((prev) => (prev + 1) % messageKeys.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [messagesIndex]);

  return (
    <div className="w-screen h-auto flex flex-col">
      <div>
        <div className="flex flex-col m-16 max-lg:mx-0 max-lg:mt-0 items-center gap-6 font-paytone text-[3.5rem] text-center">
          <Title />
        </div>
      </div>

      <div className="h-0">
        <div className="relative z-[10] -top-80 max-lg:-top-40 max-sm:-top-0">
          <div className="flex justify-between relative max-sm:-top-20">
            <ApproachableWrapper className="relative -left-8 w-[8.625rem] h-40 max-sm:w-[117.277px] max-sm:h-[130px]">
              <img src="/img/Flower.svg" alt="flower" className="w-full h-full" />
            </ApproachableWrapper>

            <ApproachableWrapper className="relative -right-1">
              <img src="/img/Party.svg" alt="party" className="max-sm:size-[117px]" />
            </ApproachableWrapper>
          </div>
          <div className="relative -top-36 flex w-full justify-between max-sm:-top-36">
            <ApproachableWrapper className="relative -left-1">
              <img
                className="max-sm:size-[180px]"
                src="/img/Illustration Provider.svg"
                alt="Illustration Provider"
              />
            </ApproachableWrapper>
            <ApproachableWrapper className="relative -right-1">
              <img
                className="max-sm:size-[180px]"
                src="/img/Illustration Student.svg"
                alt="Illustration Student"
              />
            </ApproachableWrapper>
          </div>
        </div>
        <div className="relative z-[1] -top-150 max-sm:-top-40">
          <img src="/img/Ellipse 1.svg" alt="ellipse 1" className="w-screen" />
          <div className="relative w-screen -top-1 bg-skyellow h-[33rem]"></div>
        </div>
      </div>

      <div className="relative z-[10] inline-flex flex-col items-center justify-center gap-5 m-44 max-sm:m-0 max-sm:mt-50">
        <div className="relative h-12 w-full flex justify-center items-center overflow-hidden text-2xl max-sm:text-sm">
          {prevMessagesIndex !== null && (
            <span
              key={`prev-${prevMessagesIndex}`}
              className="absolute font-bold text-center animate-slideDown-fadeOut"
            >
              {t(messageKeys[prevMessagesIndex])}
            </span>
          )}
          <span
            key={`curr-${messagesIndex}`}
            className="absolute font-bold text-center animate-slideUp-fadeIn"
          >
            {t(messageKeys[messagesIndex])}
          </span>
        </div>
        <div className="flex items-center justify-center gap-7 self-stretch [&_button]:max-sm:text-sm max-sm:flex-col max-sm:gap-4">
          <NeoButton label={t('home.open')} size="lg" onClick={() => setIsCreateModalOpen(true)} />
          <NeoButton
            label={t('home.explore')}
            variant="secondary"
            size="lg"
            onClick={() => {
              const section = document.getElementById('find-scholarship');
              if (section) section.scrollIntoView({ behavior: 'smooth' });
            }}
          />
        </div>
      </div>

      <div id="find-scholarship" className="px-9 py-12 z-[2] max-sm:px-3">
        <div className="inline-flex flex-col justify-center items-start gap-3.5">
          <h2 className="font-paytone text-5xl max-sm:text-[24px]">{t('home.find')}</h2>
          <p className="text-2xl max-sm:text-xs">{t('home.findHint')}</p>
        </div>
        <div className="py-7">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-12 h-12 border-2 border-black bg-skyellow animate-pulse shadow-[3px_3px_0_0_#000]" />
            </div>
          ) : (
            <ProgramTabs programs={programs} tabs={getTabs(t)} />
          )}
        </div>
      </div>

      <CreateProgramModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} />
    </div>
  );
}
