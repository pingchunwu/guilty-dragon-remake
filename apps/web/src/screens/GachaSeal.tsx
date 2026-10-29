import { useMemo, useRef } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import type { Rarity } from "@gdr/engine";
import { reducedMotion } from "./BattleParts";

const RANK: Record<Rarity, number> = { N: 0, R: 1, SR: 2, SSR: 3 };
const TIER = (r: Rarity) => (r === "SSR" ? "ssr" : r === "SR" ? "sr" : "n");
const RING_COLOR = { n: "#bfdcff", sr: "#ffd34d", ssr: "#fff1c9" };
const RINGS = [90, 76, 56, 36];

/** Stages 1-3 of the gacha reveal: rune circle draws, charges in the rarity colour, shatters. */
export function GachaSeal({ start, best, onDone }: { start: Rarity; best: Rarity; onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const embers = useMemo(
    () => Array.from({ length: 24 }, () => ({ x: Math.random() * 100, s: 2 + Math.random() * 4, d: 2 + Math.random() * 2 })),
    [],
  );
  const upgrade = RANK[best] > RANK[start];
  const t0 = TIER(start);
  const t1 = TIER(best);

  useGSAP(
    () => {
      if (reducedMotion()) {
        doneRef.current();
        return;
      }
      const q = gsap.utils.selector(root);
      const tl = gsap.timeline({ onComplete: () => doneRef.current() });
      root.current!.onpointerdown = () => tl.timeScale(3);

      // Embers loop on their own, independent of the tap speed-up.
      q(".gseal-ember").forEach((e, i) =>
        gsap.fromTo(e, { y: 0, opacity: 0 }, { y: -320 - (i % 5) * 40, opacity: 0.9, duration: embers[i]!.d, repeat: -1, delay: Math.random() * 2, ease: "power1.out", yoyo: false, onRepeat: () => void gsap.set(e, { opacity: 0 }) }),
      );

      // 1. Seal
      tl.from(q(".gseal-ring"), { strokeDashoffset: 1, duration: 1, stagger: 0.12, ease: "power2.inOut" }, 0)
        .from(q(".gseal-glyph"), { opacity: 0, duration: 0.5, stagger: 0.04 }, 0.5)
        .to(q(".gseal-svg"), { rotation: 40, duration: 1.2, ease: "none" }, 0);

      // 2. Omen
      tl.fromTo(q(".gseal-aura-0"), { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 1, ease: "power2.in" }, 1.2)
        .to(q(".gseal-svg"), { scale: 1.12, rotation: 140, duration: 1, ease: "power2.in" }, 1.2);
      let t = 2.2;
      if (upgrade) {
        tl.to(q(".gseal-flash"), { opacity: 0.7, duration: 0.1 }, t)
          .to(q(".gseal-flash"), { opacity: 0, duration: 0.3 }, t + 0.1)
          .fromTo(q(".gseal-root"), { x: -6 }, { x: 0, duration: 0.4, ease: "elastic.out(2,0.2)", immediateRender: false }, t)
          .to(q(".gseal-aura-0"), { opacity: 0, scale: 1.3, duration: 0.3 }, t)
          .fromTo(q(".gseal-aura-1"), { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1.1, duration: 0.5, ease: "back.out(2)" }, t)
          .to(q(".gseal-svg"), { color: RING_COLOR[t1], duration: 0.3 }, t);
        t += 0.6;
      } else {
        tl.set(q(".gseal-svg"), { color: RING_COLOR[t0] }, 1.2);
      }

      // 3. Break
      const aura = upgrade ? ".gseal-aura-1" : ".gseal-aura-0";
      tl.to(q(".gseal-svg, " + aura), { scale: 1.6, opacity: 0, duration: 0.45, ease: "power3.in" }, t)
        .fromTo(q(".gseal-flash"), { opacity: 0 }, { opacity: 1, duration: 0.15 }, t + 0.1)
        .to(q(".gseal-flash"), { opacity: 0, duration: 0.5 }, t + 0.3)
        .fromTo(q(".gseal-shard"), { x: 0, y: 0, opacity: 1, scale: 1 }, {
          x: (i: number) => Math.cos((i / 16) * Math.PI * 2) * (180 + (i % 3) * 60),
          y: (i: number) => Math.sin((i / 16) * Math.PI * 2) * (180 + (i % 3) * 60),
          rotation: (i: number) => (i % 2 ? 360 : -360),
          opacity: 0,
          scale: 0.4,
          duration: 0.6,
          ease: "power2.out",
          immediateRender: false,
        }, t + 0.1)
        .fromTo(q(".gseal-root"), { x: -8, y: 4 }, { x: 0, y: 0, duration: 0.4, ease: "elastic.out(3,0.2)", immediateRender: false }, t + 0.15)
        .to({}, { duration: 0.1 }, t + 0.8);
    },
    { scope: root },
  );

  return (
    <div className="gseal-root" ref={root}>
      <div className={`gseal-aura gseal-aura-0 gseal-${t0}`} />
      {upgrade && <div className={`gseal-aura gseal-aura-1 gseal-${t1}`} />}
      <svg className="gseal-svg" viewBox="-100 -100 200 200" style={{ color: RING_COLOR[t0] }}>
        {RINGS.map((r) => (
          <circle key={r} className="gseal-ring" r={r} pathLength={1} />
        ))}
        {Array.from({ length: 12 }, (_, i) => (
          <line key={i} className="gseal-glyph" x1="0" y1={i % 2 ? -62 : -66} x2="0" y2="-70" transform={`rotate(${i * 30})`} />
        ))}
        {Array.from({ length: 6 }, (_, i) => (
          <path key={i} className="gseal-glyph" d="M0 -50 L5 -42 L0 -34 L-5 -42 Z" transform={`rotate(${i * 60})`} />
        ))}
      </svg>
      {embers.map((e, i) => (
        <div key={i} className="gseal-ember" style={{ left: `${e.x}%`, width: e.s, height: e.s }} />
      ))}
      {Array.from({ length: 16 }, (_, i) => (
        <div key={i} className="gseal-shard" style={{ opacity: 0 }} />
      ))}
      <div className="gseal-flash" />
    </div>
  );
}
