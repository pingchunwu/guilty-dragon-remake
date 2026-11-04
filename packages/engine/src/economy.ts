import type { Rng } from "./rng";
import type { Pool } from "./catalog";
import type { Rarity } from "./skills";

/** Confirmed economy rules. */
export const DRAWS_PER_TICKET = 10;
export const TICKET_TIME_ZONE = "Asia/Taipei";
/** PLACEHOLDER: starting ticket count is an open decision. */
export const STARTING_TICKETS = 1;

export interface LoginBonusItem {
  kind: "card" | "item";
  count: number;
}

/** One login's result: the whole panel and how many slots are checked, today's included. */
export interface LoginBonus {
  panel: readonly LoginBonusItem[];
  checked: number;
}

/** PLACEHOLDER: the first login of each Taipei day checks the next slot; the panel restarts after the last. Keep in step with game_config. */
export const LOGIN_BONUS_PANEL: readonly LoginBonusItem[] = [
  { kind: "card", count: 1 },
  { kind: "item", count: 1 },
  { kind: "card", count: 1 },
  { kind: "item", count: 1 },
  { kind: "card", count: 1 },
  { kind: "item", count: 1 },
  { kind: "card", count: 1 },
];
/** PLACEHOLDER: this pull since the last SSR or UR is always SSR or better. */
export const SSR_PITY = 300;

const SR_OR_BETTER: readonly (Rarity | undefined)[] = ["SR", "SSR", "UR"];
const SSR_OR_BETTER: readonly (Rarity | undefined)[] = ["SSR", "UR"];

/** Card draw guarantees; item draws have no rarity and pass none. */
export interface Guarantee {
  rarityOf: (id: string) => Rarity | undefined;
  /** Pulls since the last SSR or UR. */
  pity: number;
}

export interface OwnedCard {
  level: number;
  /** Duplicates pulled after reaching the level cap. */
  shards: number;
  /** ISO time the player first got it; absent on items. */
  obtainedAt?: string;
}

/** Owned cards or items by ID. Items level up from duplicates the same way. */
export type Collection = Readonly<Record<string, OwnedCard>>;

export interface PullResult {
  /** Card or item ID. */
  id: string;
  isNew: boolean;
  /** Level after this pull. */
  level: number;
  /** Shards after this pull. */
  shards: number;
  leveledUp: boolean;
}

/** Card or item IDs mapped to their owned level, for battles. */
export const levelsOf = (collection: Collection): Record<string, number> =>
  Object.fromEntries(Object.entries(collection).map(([id, owned]) => [id, owned.level]));

/**
 * Adds one pulled card or item. A new one starts at level 1 and each
 * duplicate raises it one level up to maxLevel (a card's skill max, or
 * ITEM_MAX_LEVEL); duplicates past the cap become shards.
 */
export function applyPull(
  collection: Collection,
  id: string,
  maxLevel = Number.POSITIVE_INFINITY,
): { collection: Collection; result: PullResult } {
  const owned = collection[id];
  if (!owned) {
    const fresh = { level: 1, shards: 0 };
    return {
      collection: { ...collection, [id]: fresh },
      result: { id, isNew: true, ...fresh, leveledUp: false },
    };
  }
  let { level, shards } = owned;
  const leveledUp = level < maxLevel;
  if (leveledUp) level += 1;
  else shards += 1;
  return {
    collection: { ...collection, [id]: { level, shards } },
    result: { id, isNew: false, level, shards, leveledUp },
  };
}

/** Picks one ID by weight. */
export function pickFromPool(pool: Pool, rng: Rng): string {
  const total = pool.entries.reduce((sum, e) => sum + e.weight, 0);
  if (!Number.isInteger(total) || total <= 0) throw new Error(`pool ${pool.id} has invalid total weight ${total}`);
  let roll = rng.nextInt(total);
  for (const entry of pool.entries) {
    if (roll < entry.weight) return entry.id;
    roll -= entry.weight;
  }
  throw new Error("unreachable: roll exceeded total weight");
}

/**
 * One ticket's worth of pulls applied to a collection, in order. With a
 * guarantee, a ten with no SR or better turns its last pull into one, and pull
 * SSR_PITY since the last SSR or UR is SSR or better. A pool without the
 * guaranteed rarity draws normally. Keep in step with SQL gacha_draw.
 */
export function drawTen(
  collection: Collection,
  pool: Pool,
  rng: Rng,
  maxLevelOf: (id: string) => number = () => Number.POSITIVE_INFINITY,
  guarantee?: Guarantee,
): { collection: Collection; results: PullResult[]; pity: number } {
  const results: PullResult[] = [];
  let current = collection;
  let pity = guarantee?.pity ?? 0;
  let srSeen = false;
  for (let i = 0; i < DRAWS_PER_TICKET; i++) {
    let from = pool;
    if (guarantee) {
      const tier = pity + 1 >= SSR_PITY ? SSR_OR_BETTER : i === DRAWS_PER_TICKET - 1 && !srSeen ? SR_OR_BETTER : null;
      const entries = tier ? pool.entries.filter((e) => e.weight > 0 && tier.includes(guarantee.rarityOf(e.id))) : [];
      if (entries.length > 0) from = { ...pool, entries };
    }
    const id = pickFromPool(from, rng);
    if (guarantee) {
      const rarity = guarantee.rarityOf(id);
      srSeen ||= SR_OR_BETTER.includes(rarity);
      pity = SSR_OR_BETTER.includes(rarity) ? 0 : pity + 1;
    }
    const applied = applyPull(current, id, maxLevelOf(id));
    current = applied.collection;
    results.push(applied.result);
  }
  return { collection: current, results, pity };
}

/** Calendar date (YYYY-MM-DD) in Asia/Taipei, which has no daylight saving. */
export function taipeiDate(now: Date): string {
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
