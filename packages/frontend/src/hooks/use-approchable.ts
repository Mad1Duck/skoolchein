import { useEffect, useRef } from "react";
import gsap from "gsap";

function mouseMove(this: HTMLElement, event: MouseEvent) {
  event.preventDefault();
  gsap.to(this, {
    x: 0,
    y: -50,
  });
}

function mouseLeave(this: HTMLElement) {
  gsap.to(this, { x: 0, y: 0 });
}

export function useApproachable<T extends null | HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    gsap.fromTo(
      el,
      {
        opacity: 0,
      },
      { opacity: 1 }
    );

    el.addEventListener("mousemove", mouseMove);
    el.addEventListener("mouseleave", mouseLeave);

    return () => {
      el.removeEventListener("mousemove", mouseMove);
      el.removeEventListener("mouseleave", mouseLeave);
    };
  }, []);

  return [ref] as const;
}
