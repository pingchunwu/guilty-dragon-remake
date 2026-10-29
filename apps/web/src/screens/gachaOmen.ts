import { RARITIES, type Rarity } from "@gdr/engine";

const UPGRADE_CHANCE: Partial<Record<Rarity, number>> = { SR: 0.35, SSR: 0.5 };

/** Cosmetic only: the seal's colour tease. `start` is never above `best`. */
export function omenOf(rarities: Rarity[], roll: () => number = Math.random): { best: Rarity; start: Rarity } {
  const rank = (r: Rarity) => RARITIES.indexOf(r);
  const best = rarities.reduce<Rarity>((b, r) => (rank(r) > rank(b) ? r : b), "N");
  const chance = UPGRADE_CHANCE[best] ?? 0;
  return { best, start: roll() < chance ? (RARITIES[rank(best) - 1] ?? best) : best };
}
