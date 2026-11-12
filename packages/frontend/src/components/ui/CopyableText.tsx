import { useEffect, useRef, useState, type ReactNode } from "react";

interface CopyableTextProps {
  /** Full value: copied to the clipboard and shown in the tooltip. */
  value: string;
  /** What to render instead of the full value (e.g. a truncated address). */
  display?: string;
  /** Rendered before the text, e.g. an avatar. */
  leading?: ReactNode;
  /** "box" draws the bordered chip used in registries; "plain" is inline text. */
  variant?: "plain" | "box";
  className?: string;
}

/** Truncate the middle of a long string: 0x70bDA08D…8560605B */
export function truncateMiddle(value: string, head = 6, tail = 4): string {
  if (!value) return "—";
  return value.length <= head + tail + 1 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API is unavailable on non-secure origins; fall back to a temporary textarea.
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  }
}

/**
 * Shows a (possibly truncated) value with the full text in a tooltip, and copies
 * the full value on click. Use anywhere an address, hash or CID is shortened.
 */
export function CopyableText({ value, display, leading, variant = "plain", className = "" }: CopyableTextProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  if (!value) return <span className="text-gray-400">—</span>;

  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation(); // don't trigger a clickable table row
    if (await copyToClipboard(value)) {
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1400);
    }
  };

  const base =
    variant === "box"
      ? "bg-white text-gray-600 px-2 py-1 border-2 border-black rounded-lg shadow-[2px_2px_0_0_#000] hover:bg-skyellow-light active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
      : "hover:text-skpurple";

  return (
    <button
      type="button"
      onClick={onClick}
      title={copied ? "Copied!" : `${value}\nClick to copy`}
      aria-label={`Copy ${value}`}
      className={`group relative inline-flex items-center gap-1.5 font-data text-xs font-bold transition-colors cursor-copy max-w-full ${base} ${className}`}
    >
      {leading}
      <span className="truncate">{display ?? value}</span>
      <svg
        className="size-3 shrink-0 opacity-40 group-hover:opacity-100"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="9" y="9" width="13" height="13" rx="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
      {copied && (
        <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border-2 border-black bg-skgreen px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-black shadow-[2px_2px_0_0_#000]">
          Copied
        </span>
      )}
    </button>
  );
}
