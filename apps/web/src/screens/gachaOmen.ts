import type { Rarity } from "@gdr/engine";

/** What the seal animation does: no SR+ => plain seal; SR/SSR/UR => breakthrough then a "how good" phase. */
export type Omen = { good: boolean; tier: "SR" | "SSR" | "UR" | null };

/** Cosmetic only. SSR and UR packs always start as the SR look, so the first seconds never give the pull away; the seal then glitches and breaks open. */
export function omenOf(rarities: Rarity[]): Omen {
  const tier = rarities.includes("UR") ? "UR" : rarities.includes("SSR") ? "SSR" : rarities.includes("SR") ? "SR" : null;
  return { good: tier !== null, tier };
}
