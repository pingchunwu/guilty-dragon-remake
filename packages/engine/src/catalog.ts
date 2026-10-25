import type { Armor, CardDefinition, CardType, Deck } from "./types";

/**
 * PLACEHOLDER content for development: 16 cards per type, no art, attack only.
 * Replace once the card design (original vs. recreated, rarity, stats) is
 * decided. supabase/seed is generated from this file; keep them in sync with
 * `npm run gen:seed`.
 */
const TYPE_LABEL: Record<CardType, string> = { heavy: "重裝", light: "輕裝", magic: "魔裝" };
const PER_TYPE = 16;

export const placeholderCardId = (type: CardType, n: number) => `ph-${type}-${String(n).padStart(2, "0")}`;

const TYPE_OFFSET: Record<CardType, number> = { heavy: 0, light: 5, magic: 11 };

export const PLACEHOLDER_CARDS: readonly CardDefinition[] = (["heavy", "light", "magic"] as const).flatMap((type) =>
  Array.from({ length: PER_TYPE }, (_, i) => ({
    id: placeholderCardId(type, i + 1),
    name: `${TYPE_LABEL[type]}試作 ${String(i + 1).padStart(2, "0")}`,
    type,
    // Spread across 40–100 so hands differ; not balanced.
    attack: 40 + (((i + TYPE_OFFSET[type]) * 37) % 61),
  })),
);

/**
 * PLACEHOLDER armor everyone wears until armor acquisition is designed.
 * Balance rule: defense must stay below the lowest card attack so every won
 * phase deals damage (battles have no phase cap).
 */
export const PLACEHOLDER_STARTER_ARMOR: Armor = { id: "ph-armor-01", name: "見習防具", defense: 30 };

const range = (type: CardType, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => placeholderCardId(type, from + i));

/** PLACEHOLDER default deck granted once on first sign-in (and used by guests). */
export const PLACEHOLDER_DEFAULT_DECK: Deck = {
  heavy: range("heavy", 1, 8),
  light: range("light", 1, 8),
  magic: range("magic", 1, 8),
  free: [...range("heavy", 9, 11), ...range("light", 9, 11), ...range("magic", 9, 10)],
};

export interface PoolEntry {
  cardId: string;
  weight: number;
}

export interface CardPool {
  id: string;
  entries: readonly PoolEntry[];
}

/** PLACEHOLDER pool: every card, equal weight. Odds/rarity are still TBD. */
export const PLACEHOLDER_POOL: CardPool = {
  id: "pool-v0",
  entries: PLACEHOLDER_CARDS.map((c) => ({ cardId: c.id, weight: 1 })),
};
