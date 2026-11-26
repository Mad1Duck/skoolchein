import { WalletButtonState } from "./wallet/WalletButtonState";

interface ButtonProps {
  label?: React.ReactNode;
  type?: "button" | "submit" | "connect";
  size?: "small" | "large";
  variant?: "primary" | "secondary";
  bgShadow?: string;
  onClick?: () => void;
  className?: string;
  wrapperClassName?: string;
}

const getButtonClasses = (
  size: string = "small",
  bgColor: string = "bg-skpurple",
  hover: string = "bg-skpurple-hover",
  textColor: string = "text-white",
  className?: string
) => {
  const sizeClass =
    size === "small" ? "py-2 px-4 text-base" : "px-6 py-3 text-2xl";
  return `flex relative -left-1 -top-1 font-nunito ${sizeClass} items-center gap-2.5 rounded-lg border-solid border-black ${bgColor} ${textColor} hover:${hover} active:inset-shadow-pressed transition-transform active:translate-x-1 active:translate-y-1 border-2 border-black ${className}`;
};

const ButtonWrapper = ({
  bgShadow = "bg-black",
  children,
}: {
  bgShadow?: string;
  children: React.ReactNode;
}) => (
  <div
    className={`flex items-center gap-2.5 self-stretch rounded-lg ${bgShadow}`}
  >
    {children}
  </div>
);

export const Button = ({
  label = "buttonLabel",
  type = "button",
  size = "small",
  variant = "primary",
  bgShadow = "bg-black",
  onClick = () => {},
  className,
  wrapperClassName,
}: ButtonProps) => {
  if (type !== "connect") {
    return (
      <div className={`flex flex-col items-start ${wrapperClassName}`}>
        <ButtonWrapper bgShadow={bgShadow}>
          <button
            onClick={onClick}
            type={type}
            className={getButtonClasses(
              size,
              variant === "secondary" ? "bg-skbw" : "bg-skpurple",
              variant === "secondary" ? "bg-skbw-hover" : "bg-skpurple-hover",
              variant === "secondary" ? "text-black" : "text-white",
              className
            )}
          >
            {label}
          </button>
        </ButtonWrapper>
      </div>
    );
  }

  return (
    <WalletButtonState>
      {({
        isConnected,
        openProfileModal,
        account,
        chain,
        openChainModal,
        openConnectModal,
      }) => {
        const ready = true;
        const connected = ready && account && isConnected;

        if (!ready) {
          return (
            <div
              aria-hidden="true"
              style={{
                opacity: 0,
                pointerEvents: "none",
                userSelect: "none",
              }}
            />
          );
        }

        const address = `${account?.address?.slice(0, 6)}...${account?.address?.slice(-4)}`;
        return (
          <div
            className={`flex flex-col items-start gap-2 ${wrapperClassName}`}
          >
            {!connected ? (
              <ButtonWrapper>
                <button
                  onClick={openConnectModal}
                  type="button"
                  className={`${getButtonClasses(size)} max-lg:w-full`}
                >
                  {label}
                </button>
              </ButtonWrapper>
            ) : !chain ? (
              <ButtonWrapper>
                <button
                  onClick={openChainModal}
                  type="button"
                  className={getButtonClasses(size, "bg-skred", "bg-skpink")}
                >
                  Wrong network
                </button>
              </ButtonWrapper>
            ) : (
              <div className="flex gap-2 max-lg:flex-col max-lg:w-full">
                <ButtonWrapper>
                  <button
                    onClick={openChainModal}
                    type="button"
                    className={`${getButtonClasses(size)} max-lg:w-full`}
                  >
                    {/* {chain.hasIcon && chain.iconUrl && (
                      <div
                        style={{
                          background: chain.iconBackground,
                          width: 12,
                          height: 12,
                          borderRadius: 999,
                          overflow: "hidden",
                          marginRight: 4,
                        }}
                      >
                        <img
                          alt={chain.name ?? "Chain icon"}
                          src={chain.iconUrl}
                          style={{ width: 12, height: 12 }}
                        />
                      </div>
                    )} */}
                    {chain.name}
                  </button>
                </ButtonWrapper>

                <ButtonWrapper>
                  <button
                    onClick={openProfileModal}
                    type="button"
                    className={`${getButtonClasses(size)} max-lg:w-full`}
                  >
                    {address}
                    {account.balanceFormatted &&
                      ` (${account.balanceFormatted.slice(0, 5)})`}
                  </button>
                </ButtonWrapper>
              </div>
            )}
          </div>
        );
      }}
    </WalletButtonState>
  );
};
