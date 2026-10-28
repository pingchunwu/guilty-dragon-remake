import {
  ITEM_KINDS,
  WEAPON_KINDS,
  type CardDefinition,
  type CardType,
  type Deck,
  type ItemDefinition,
  type ItemKind,
  type Loadout,
} from "./types";
import { OG_CARDS } from "./og-cards";
import type { Rarity } from "./skills";

/**
 * Card library: the original game's cards (og-cards.ts, generated from
 * docs/og-data), no art. supabase/seed is generated from this file; keep them
 * in sync with `npm run gen:seed`.
 */
export const PLACEHOLDER_CARDS: readonly CardDefinition[] = OG_CARDS;

const ofType = (type: CardType) => PLACEHOLDER_CARDS.filter((c) => c.type === type).map((c) => c.id);

/** Default deck granted once on first sign-in (and used by guests): the first 11 cards of each type, i.e. the N cards. */
export const PLACEHOLDER_DEFAULT_DECK: Deck = {
  heavy: ofType("heavy").slice(0, 8),
  light: ofType("light").slice(0, 8),
  magic: ofType("magic").slice(0, 8),
  free: [...ofType("heavy").slice(8, 11), ...ofType("light").slice(8, 11), ...ofType("magic").slice(8, 10)],
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

/** PLACEHOLDER draw weight of one card by rarity; real odds are still TBD. */
export const RARITY_WEIGHT: Record<Rarity, number> = { N: 12, R: 5, SR: 2, SSR: 1 };

/** PLACEHOLDER pool: every card, weighted by rarity. */
export const PLACEHOLDER_POOL: Pool = {
  id: "pool-v2",
  entries: PLACEHOLDER_CARDS.map((c) => ({ id: c.id, weight: RARITY_WEIGHT[c.rarity] })),
};

const ITEM_LABEL: Record<ItemKind, string> = {
  heavy: "重裝武器",
  light: "輕裝武器",
  magic: "魔裝武器",
  head: "頭甲",
  body: "胴甲",
  legs: "腿甲",
  back: "背甲",
};
const PER_KIND = 6;
const isWeapon = (kind: ItemKind): kind is CardType => WEAPON_KINDS.includes(kind as CardType);
const itemId = (kind: ItemKind, n: number) =>
  `ph-${isWeapon(kind) ? "weapon" : "armor"}-${kind}-${String(n).padStart(2, "0")}`;

/**
 * PLACEHOLDER equipment, 6 per slot on the original's scale. Item 01 of each
 * kind is the starter. Weapons 300–2000 (card POW scale), armor pieces 2–10%
 * defense; a side's defense % is the sum of its 4 pieces.
 */
export const PLACEHOLDER_ITEMS: readonly ItemDefinition[] = ITEM_KINDS.flatMap((kind) =>
  Array.from({ length: PER_KIND }, (_, i) => ({
    id: itemId(kind, i + 1),
    name: i === 0 ? `見習${ITEM_LABEL[kind]}` : `${ITEM_LABEL[kind]}試作 ${String(i + 1).padStart(2, "0")}`,
    kind,
    attack: isWeapon(kind) ? 300 + 340 * i : 0,
    defense: isWeapon(kind) ? 0 : 2 + Math.floor((8 * i) / (PER_KIND - 1)),
  })),
);

/** PLACEHOLDER loadout granted to every player (and guests): 3 weapons at 300 and 4 armor pieces at 2%. */
export const PLACEHOLDER_STARTER_LOADOUT = Object.fromEntries(ITEM_KINDS.map((k) => [k, itemId(k, 1)])) as Loadout;

/** PLACEHOLDER item pool: every item, equal weight, same tickets as cards. */
export const PLACEHOLDER_ITEM_POOL: Pool = {
  id: "item-pool-v1",
  entries: PLACEHOLDER_ITEMS.map((item) => ({ id: item.id, weight: 1 })),
};
