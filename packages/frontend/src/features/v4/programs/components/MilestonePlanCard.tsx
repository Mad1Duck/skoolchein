import { PANEL } from '@/components/ui/surface';
import { useMilestonePlan } from '@/lib/contracts/v4/hooks/selection';
import { decodeSpec } from '@/lib/milestoneSpec';
import { useT } from '@/lib/i18n';

/**
 * What every winner of this program will have to deliver: each milestone's share of the payout, the
 * creator's instruction, and whether proof is required. Shown on the program page so an applicant
 * knows the terms before applying. Renders nothing until the creator has saved a plan.
 */
export function MilestonePlanCard({ programId }: { programId: number }) {
  const { t } = useT();
  const { plan } = useMilestonePlan(programId);
  if (!plan || plan.shareBps.length === 0) return null;

  return (
    <section className={`${PANEL} p-5 space-y-3`}>
        <div>
          <h3 className="font-paytone text-lg">{t('planCard.title')}</h3>
          <p className="text-xs text-gray-600">{t('planCard.help')}</p>
        </div>
        <ol className="rounded-xl border-2 border-black divide-y divide-black/10 overflow-hidden">
          {plan.shareBps.map((bps, i) => {
            const spec = decodeSpec(plan.descriptions[i]);
            const provider = plan.providers[i];
            return (
              <li key={i} className="flex items-start gap-3 px-3 py-2.5">
                <span className="w-7 h-7 rounded-lg bg-black text-white flex items-center justify-center text-xs font-bold shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold [overflow-wrap:anywhere]">{spec.text || t('plan.item', { n: i + 1 })}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {provider ? (
                      <span className="rounded-md border-2 border-black bg-skcyan px-1.5 text-[10px] font-extrabold uppercase">{provider}</span>
                    ) : spec.proof ? (
                      <span className="rounded-md border-2 border-black bg-skyellow px-1.5 text-[10px] font-extrabold uppercase">{t('spec.badge')}</span>
                    ) : null}
                  </div>
                </div>
                <span className="font-data text-sm font-bold shrink-0">{bps / 100}%</span>
              </li>
            );
          })}
        </ol>
    </section>
  );
}
