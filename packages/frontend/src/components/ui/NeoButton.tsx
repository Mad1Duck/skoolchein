import type { ReactNode, ButtonHTMLAttributes } from 'react';
import { ConnectButton } from '@xellar/kit';

type Variant = 'primary' | 'secondary' | 'danger' | 'success' | 'ghost' | 'connect';
type Size = 'sm' | 'md' | 'lg';

interface NeoButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label?: string;
  children?: ReactNode;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  fullWidth?: boolean;
  wrapperClassName?: string;
}

/* Brutalist buttons: solid fill, 2px black border, 3px hard shadow.
   Hover collapses shadow + translates (3px,3px). 100ms transition. */
const variantStyles: Record<Exclude<Variant, 'connect'>, string> = {
  primary: 'bg-skpurple text-white border-black shadow-[3px_3px_0_0_#000] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[1px_1px_0_0_#000] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none',
  secondary: 'bg-white text-black border-black shadow-[3px_3px_0_0_#000] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[1px_1px_0_0_#000] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none',
  danger: 'bg-skred text-white border-black shadow-[3px_3px_0_0_#000] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[1px_1px_0_0_#000] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none',
  success: 'bg-skgreen text-black border-black shadow-[3px_3px_0_0_#000] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[1px_1px_0_0_#000] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none',
  ghost: 'bg-transparent text-black border-transparent shadow-none hover:shadow-none hover:bg-gray-100',
};

const sizeStyles: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm rounded-md',
  md: 'px-4 py-2 text-base rounded-md',
  lg: 'px-6 py-3 text-lg rounded-md',
};

const baseClasses = `
  inline-flex items-center justify-center gap-2
  font-bold font-nunito border-2
  select-none
  transition-all duration-75 ease-out
  disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-x-[3px] disabled:translate-y-[3px]
  cursor-pointer
`;

export function NeoButton({
  label,
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  fullWidth = false,
  wrapperClassName = '',
  className = '',
  disabled,
  ...rest
}: NeoButtonProps) {
  if (variant === 'connect') {
    return (
      <ConnectButton.Custom>
        {({ isConnected, openProfileModal, account, chain, openChainModal, openConnectModal }) => {
          if (!isConnected) {
            return (
              <div className={wrapperClassName}>
                <button
                  onClick={openConnectModal}
                  className={`${baseClasses} bg-skyellow text-black border-black shadow-[3px_3px_0_0_#000] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[1px_1px_0_0_#000] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none ${sizeStyles[size]} ${fullWidth ? 'w-full' : ''} ${className}`}>
                  {label ?? children ?? 'Connect Wallet'}
                </button>
              </div>
            );
          }

          if (!chain) {
            return (
              <div className={wrapperClassName}>
                <button
                  onClick={openChainModal}
                  className={`${baseClasses} bg-skred text-white border-black shadow-[3px_3px_0_0_#000] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[1px_1px_0_0_#000] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none ${sizeStyles[size]} ${fullWidth ? 'w-full' : ''} ${className}`}>
                  Wrong Network
                </button>
              </div>
            );
          }

          const addr = account?.address
            ? `${account.address.slice(0, 6)}…${account.address.slice(-4)}`
            : 'Connected';

          return (
            <div className={`flex gap-2 ${wrapperClassName}`}>
              <button
                onClick={openChainModal}
                className={`${baseClasses} bg-white text-black border-black shadow-[3px_3px_0_0_#000] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[1px_1px_0_0_#000] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none ${sizeStyles[size]} ${className}`}>
                {chain.name}
              </button>
              <button
                onClick={openProfileModal}
                className={`${baseClasses} bg-skyellow text-black border-black shadow-[3px_3px_0_0_#000] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[1px_1px_0_0_#000] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none ${sizeStyles[size]} ${className} font-data`}>
                {addr}
              </button>
            </div>
          );
        }}
      </ConnectButton.Custom>
    );
  }

  const Spinner = () => (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );

  return (
    <div className={wrapperClassName}>
      <button
        disabled={disabled || loading}
        className={`
          ${baseClasses}
          ${variantStyles[variant]}
          ${sizeStyles[size]}
          ${fullWidth ? 'w-full' : ''}
          ${className}
        `}
        {...rest}>
        {loading ? <Spinner /> : (icon ?? null)}
        {label ?? children}
      </button>
    </div>
  );
}
