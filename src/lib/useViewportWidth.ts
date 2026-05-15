import { useEffect, useState } from "react";

/** Subscribes to window width changes. SSR-safe (returns Infinity until mounted). */
export function useViewportWidth(): number {
  const [w, setW] = useState<number>(() =>
    typeof window === "undefined" ? Number.POSITIVE_INFINITY : window.innerWidth,
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const on = () => setW(window.innerWidth);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return w;
}
