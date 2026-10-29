import type { Rarity } from "@gdr/engine";

/** What the seal animation does: no SR+ => plain seal; SR/SSR => breakthrough then a "how good" phase. */
export type Omen = { good: boolean; tier: "SR" | "SSR" | null; tease: boolean };

/** Cosmetic only. `tease`: an SSR pack first shows the SR (violet) look, then ascends to gold. */
export function omenOf(rarities: Rarity[], roll: () => number = Math.random): Omen {
  const tier = rarities.includes("SSR") ? "SSR" : rarities.includes("SR") ? "SR" : null;
  return { good: tier !== null, tier, tease: tier === "SSR" && roll() < 0.5 };
}
