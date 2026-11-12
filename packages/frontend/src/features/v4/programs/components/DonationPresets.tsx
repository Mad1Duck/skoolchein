import { donationPresets, getTokenMeta } from '@/lib/contracts/v4/token';

interface Props {
  token?: string | null;
  value: string;
  onChange: (amount: string) => void;
  disabled?: boolean;
}

/** Row of quick-pick donation amounts, shared by the program card and DonateModal. */
export function DonationPresets({ token, value, onChange, disabled }: Props) {
  const { isNative, symbol } = getTokenMeta(token);
  return (
    <div className="flex flex-wrap gap-2">
      {donationPresets(token).map((preset) => {
        const active = Number(value) === Number(preset);
        return (
          <button
            key={preset}
            type="button"
            disabled={disabled}
            onClick={() => onChange(preset)}
            className={`px-3 py-1.5 border-2 border-black rounded-xl font-bold text-sm font-data transition-all duration-75 disabled:opacity-40 ${
              active
                ? 'bg-skpurple text-white shadow-none translate-x-[2px] translate-y-[2px]'
                : 'bg-white text-black shadow-[2px_2px_0_0_#000] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none'
            }`}
          >
            {isNative ? `${preset} ${symbol}` : `$${Number(preset).toLocaleString('en-US')}`}
          </button>
        );
      })}
    </div>
  );
}
