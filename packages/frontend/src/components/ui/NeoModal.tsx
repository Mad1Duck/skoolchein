import type { ReactNode } from "react";

interface NeoModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}

const sizeMap = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export function NeoModal({ isOpen, onClose, title, children, size = "md" }: NeoModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal content */}
      <div
        className={`
          relative w-full ${sizeMap[size]}
          bg-white border-[2.5px] border-black rounded-lg
          shadow-[5px_5px_0_0_#000]
          animate-[slide-up_0.2s_ease-out]
          max-h-[85vh] flex flex-col
        `}
      >
        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-5 py-3.5 border-b-2 border-black bg-gray-50">
            <h2 className="font-paytone text-xl">{title}</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center border-2 border-black bg-white
                         hover:bg-skred hover:text-white transition-colors duration-75 font-bold text-lg shadow-[2px_2px_0_0_#000] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]"
            >
              ×
            </button>
          </div>
        )}

        {/* Body */}
        <div className="overflow-y-auto p-5 flex-1">
          {children}
        </div>
      </div>
    </div>
  );
}
