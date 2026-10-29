import { RARITIES, type Rarity } from "@gdr/engine";

/** Cosmetic only: the seal's colour tease. Only SSR teases (starts blue, may crack to gold). */
export function omenOf(rarities: Rarity[], roll: () => number = Math.random): { best: Rarity; start: Rarity } {
  const rank = (r: Rarity) => RARITIES.indexOf(r);
  const best = rarities.reduce<Rarity>((b, r) => (rank(r) > rank(b) ? r : b), "N");
  return { best, start: best === "SSR" && roll() < 0.5 ? "SR" : best };
}
