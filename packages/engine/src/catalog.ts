import type { CardDefinition, CardType, Deck, ItemDefinition, ItemKind, Loadout } from "./types";

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
  /** Card ID in a card pool, item ID in an item pool. */
  id: string;
  weight: number;
}

export interface Pool {
  id: string;
  entries: readonly PoolEntry[];
}

/** PLACEHOLDER pool: every card, equal weight. Odds/rarity are still TBD. */
export const PLACEHOLDER_POOL: Pool = {
  id: "pool-v0",
  entries: PLACEHOLDER_CARDS.map((c) => ({ id: c.id, weight: 1 })),
};

const ITEM_LABEL: Record<ItemKind, string> = { armor: "防具", weapon: "武器", gear: "飾品" };
const PER_KIND = 6;
const itemId = (kind: ItemKind, n: number) => `ph-${kind}-${String(n).padStart(2, "0")}`;

/**
 * PLACEHOLDER equipment, 6 of each kind. Item 01 of each kind is the starter.
 * Balance rule: armor defense must stay below the lowest card attack so every
 * won phase deals damage (battles have no phase cap). Weapon attack is added
 * after multipliers. Gear has no stats until its effect is decided.
 */
export const PLACEHOLDER_ITEMS: readonly ItemDefinition[] = (["armor", "weapon", "gear"] as const).flatMap((kind) =>
  Array.from({ length: PER_KIND }, (_, i) => ({
    id: itemId(kind, i + 1),
    name: i === 0 ? `見習${ITEM_LABEL[kind]}` : `${ITEM_LABEL[kind]}試作 ${String(i + 1).padStart(2, "0")}`,
    kind,
    attack: kind === "weapon" ? 10 * (i + 1) : 0,
    defense: kind === "armor" ? 20 + 3 * i : 0,
  })),
);

/** PLACEHOLDER loadout granted to every player (and guests). */
export const PLACEHOLDER_STARTER_LOADOUT: Loadout = {
  armor: itemId("armor", 1),
  weapon: itemId("weapon", 1),
  gear: itemId("gear", 1),
};

/** PLACEHOLDER item pool: every item, equal weight, same tickets as cards. */
export const PLACEHOLDER_ITEM_POOL: Pool = {
  id: "item-pool-v0",
  entries: PLACEHOLDER_ITEMS.map((item) => ({ id: item.id, weight: 1 })),
};
