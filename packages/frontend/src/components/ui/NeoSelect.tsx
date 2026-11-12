import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface NeoSelectOption<T extends string | number> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface NeoSelectProps<T extends string | number> {
  value: T;
  onChange: (value: T) => void;
  options: NeoSelectOption<T>[];
  /** Shown when `value` matches no option (e.g. an empty form field). */
  placeholder?: string;
  size?: "md" | "sm";
  disabled?: boolean;
  ariaLabel?: string;
  /** Classes for the wrapper — use it to set a width (default: full width of the parent). */
  className?: string;
}

const MENU_MAX_HEIGHT = 288;
const GAP = 6;

/**
 * The one dropdown used across the app. Replaces the native <select>, whose
 * option list is drawn by the OS and cannot be styled. Same look as our inputs,
 * keyboard accessible (arrows, Home/End, Enter/Space, Esc, type-ahead), and the
 * list renders in a portal so it is never clipped by a modal's scroll area.
 */
export function NeoSelect<T extends string | number>({
  value,
  onChange,
  options,
  placeholder = "Select…",
  size = "md",
  disabled = false,
  ariaLabel,
  className = "",
}: NeoSelectProps<T>) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const typeahead = useRef({ text: "", timer: undefined as ReturnType<typeof setTimeout> | undefined });

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number } | null>(null);

  const selectedIndex = useMemo(() => options.findIndex((o) => o.value === value), [options, value]);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  // ── Positioning (fixed, flips above when there is no room below) ───────────
  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom - GAP - 8;
    const spaceAbove = r.top - GAP - 8;
    const wanted = Math.min(MENU_MAX_HEIGHT, options.length * 40 + 8);
    const flip = spaceBelow < wanted && spaceAbove > spaceBelow;
    setPos(
      flip
        ? { left: r.left, width: r.width, bottom: window.innerHeight - r.top + GAP, maxHeight: Math.min(MENU_MAX_HEIGHT, spaceAbove) }
        : { left: r.left, width: r.width, top: r.bottom + GAP, maxHeight: Math.min(MENU_MAX_HEIGHT, spaceBelow) },
    );
  }, [options.length]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const reposition = () => place();
    document.addEventListener("mousedown", onDown);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true); // capture: also scrolling containers
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, place]);

  // Keep the highlighted option visible while moving with the keyboard.
  useEffect(() => {
    if (!open || active < 0) return;
    menuRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const openMenu = () => {
    if (disabled) return;
    setActive(selectedIndex >= 0 ? selectedIndex : options.findIndex((o) => !o.disabled));
    setOpen(true);
  };
  const choose = (i: number) => {
    const opt = options[i];
    if (!opt || opt.disabled) return;
    onChange(opt.value);
    setOpen(false);
    triggerRef.current?.focus();
  };
  const move = (from: number, dir: 1 | -1) => {
    for (let i = from + dir; i >= 0 && i < options.length; i += dir) if (!options[i].disabled) return i;
    return from;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive((a) => move(a, 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((a) => move(a, -1));
        break;
      case "Home":
        e.preventDefault();
        setActive(move(-1, 1));
        break;
      case "End":
        e.preventDefault();
        setActive(move(options.length, -1));
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        choose(active);
        break;
      case "Escape":
        e.preventDefault();
        setOpen(false);
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        // Type-ahead: jump to the next option starting with what was typed.
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
          const ta = typeahead.current;
          clearTimeout(ta.timer);
          ta.text += e.key.toLowerCase();
          ta.timer = setTimeout(() => (ta.text = ""), 600);
          const from = ta.text.length === 1 ? active : active - 1;
          const order = [...options.keys()].map((_, k) => (from + 1 + k) % options.length);
          const hit = order.find((i) => !options[i].disabled && options[i].label.toLowerCase().startsWith(ta.text));
          if (hit !== undefined) setActive(hit);
        }
    }
  };

  const sm = size === "sm";

  return (
    <div className={`relative ${className || "w-full"}`}>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-activedescendant={open && active >= 0 ? `${id}-opt-${active}` : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        className={`w-full flex items-center justify-between gap-2 text-left bg-white border-2 border-black font-bold
          shadow-[2px_2px_0_0_#000] hover:shadow-[3px_3px_0_0_#000] transition-[box-shadow,border-color] duration-75
          focus:outline-none focus:border-skpurple focus:shadow-[2px_2px_0_0_var(--color-skpurple)]
          disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none cursor-pointer
          ${sm ? "rounded-[0.625rem] px-3 py-1.5 text-sm" : "rounded-xl px-3.5 py-2.5 text-base"}
          ${open ? "border-skpurple" : ""}`}
      >
        <span className={`truncate ${selected ? "" : "font-medium text-gray-400"}`}>{selected?.label ?? placeholder}</span>
        <svg
          className={`shrink-0 transition-transform duration-100 ${open ? "rotate-180" : ""} ${sm ? "size-3.5" : "size-4"}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open &&
        pos &&
        createPortal(
          <ul
            ref={menuRef}
            id={`${id}-list`}
            role="listbox"
            style={{
              position: "fixed",
              left: pos.left,
              minWidth: pos.width,
              top: pos.top,
              bottom: pos.bottom,
              maxHeight: pos.maxHeight,
            }}
            className="z-[70] overflow-y-auto rounded-xl border-2 border-black bg-white p-1 shadow-[4px_4px_0_0_#000] animate-[slide-up_0.1s_ease-out]"
          >
            {options.map((opt, i) => {
              const isSelected = i === selectedIndex;
              const isActive = i === active;
              return (
                <li
                  key={String(opt.value)}
                  id={`${id}-opt-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={opt.disabled}
                  onMouseEnter={() => !opt.disabled && setActive(i)}
                  onMouseDown={(e) => e.preventDefault()} // keep focus on the trigger
                  onClick={() => choose(i)}
                  className={`flex items-center justify-between gap-3 rounded-lg px-3 whitespace-nowrap font-bold
                    ${sm ? "py-1.5 text-sm" : "py-2 text-base"}
                    ${opt.disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}
                    ${isSelected ? "bg-skpurple text-white" : isActive ? "bg-skpurple-light" : ""}`}
                >
                  <span>{opt.label}</span>
                  {isSelected && <span aria-hidden="true">✓</span>}
                </li>
              );
            })}
          </ul>,
          document.body,
        )}
    </div>
  );
}
