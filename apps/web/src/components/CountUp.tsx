import { useEffect, useState } from "react";
import { money } from "../lib/money";

function useCountUp(target: number, durationMs = 800): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }
    let start: number | null = null;
    let raf: number;
    function tick(t: number) {
      if (start === null) start = t;
      const progress = Math.min((t - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(target * eased);
      if (progress < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return value;
}

/** Animates a currency figure counting up from 0 on mount, so the headline
 * dashboard numbers read as freshly-computed rather than static text. */
export function CountUpMoney({ value, durationMs }: { value: number; durationMs?: number }) {
  const animated = useCountUp(value, durationMs);
  return <>{money(animated)}</>;
}

/** Same idea for a plain percentage figure (e.g. "6.64%"). */
export function CountUpPercent({ value, durationMs }: { value: number; durationMs?: number }) {
  const animated = useCountUp(value, durationMs);
  return <>{animated.toFixed(2)}%</>;
}
