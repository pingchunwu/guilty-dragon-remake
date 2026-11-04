import { RARITIES, type CardDefinition, type Collection, type Rarity } from "@gdr/engine";

export type CardSort = "rarity" | "obtained" | "attack" | "draw";

export interface CardQuery {
  sort: CardSort;
  descending: boolean;
  rarity: Rarity | "all";
  /** Only cards obtained in the last N days; 0 means any time. */
  obtainedDays: number;
  minAttack: number;
  /** Exact DRAW value; -1 means any. */
  draw: number;
}

export const DEFAULT_CARD_QUERY: CardQuery = { sort: "rarity", descending: true, rarity: "all", obtainedDays: 0, minAttack: 0, draw: -1 };

const DAY_MS = 86_400_000;

/** Filters and orders owned cards; equal cards fall back to the highest rarity first. */
export function queryCards(cards: CardDefinition[], owned: Collection, q: CardQuery, now = Date.now()): CardDefinition[] {
  const rank = (c: CardDefinition) => RARITIES.indexOf(c.rarity);
  const obtained = (c: CardDefinition) => Date.parse(owned[c.id]?.obtainedAt ?? "") || 0;
  const value = (c: CardDefinition) =>
    q.sort === "rarity" ? rank(c) : q.sort === "obtained" ? obtained(c) : q.sort === "attack" ? c.attack : c.draw;
  const direction = q.descending ? 1 : -1;
  return cards
    .filter(
      (c) =>
        (q.rarity === "all" || c.rarity === q.rarity) &&
        (q.obtainedDays === 0 || obtained(c) >= now - q.obtainedDays * DAY_MS) &&
        c.attack >= q.minAttack &&
        (q.draw === -1 || c.draw === q.draw),
    )
    .sort((a, b) => direction * (value(b) - value(a)) || rank(b) - rank(a));
}
