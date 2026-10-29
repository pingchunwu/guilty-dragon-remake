import { useEffect, useRef, useState } from "react";

const STEP = 32;

/** Render a long list in chunks: show `limit` items, and attach `sentinel` after the list to append more on scroll. */
export function useChunk(total: number, resetKey: unknown) {
  const [limit, setLimit] = useState(STEP);
  const ref = useRef<HTMLDivElement>(null);
  // Filter changed: start from the top again.
  useEffect(() => setLimit(STEP), [resetKey]);
  useEffect(() => {
    const el = ref.current;
    if (!el || limit >= total) return;
    const io = new IntersectionObserver((e) => e[0]?.isIntersecting && setLimit((n) => n + STEP), { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [limit, total]);
  return { limit, sentinel: limit < total ? <div ref={ref} aria-hidden="true" style={{ height: 1 }} /> : null };
}
