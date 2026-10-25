import type { Rng } from "./rng";
import type { Pool } from "./catalog";

/** Confirmed economy rules. */
export const DRAWS_PER_TICKET = 10;
export const SHARDS_PER_LEVEL = 5;
export const TICKET_TIME_ZONE = "Asia/Taipei";
/** PLACEHOLDER: starting ticket count is an open decision. */
export const STARTING_TICKETS = 1;

export interface OwnedCard {
  level: number;
  shards: number;
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

/**
 * Adds one pulled card or item. A new one starts at level 1; a duplicate
 * becomes one shard, and every SHARDS_PER_LEVEL shards raise it one level. No
 * level cap yet, and levels have no battle effect yet (open decisions).
 */
export function applyPull(collection: Collection, id: string): { collection: Collection; result: PullResult } {
  const owned = collection[id];
  if (!owned) {
    const fresh = { level: 1, shards: 0 };
    return {
      collection: { ...collection, [id]: fresh },
      result: { id, isNew: true, ...fresh, leveledUp: false },
    };
  }
  let { level, shards } = owned;
  shards += 1;
  const leveledUp = shards >= SHARDS_PER_LEVEL;
  if (leveledUp) {
    level += 1;
    shards -= SHARDS_PER_LEVEL;
  }
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

/** One ticket's worth of pulls applied to a collection, in order. */
export function drawTen(
  collection: Collection,
  pool: Pool,
  rng: Rng,
): { collection: Collection; results: PullResult[] } {
  const results: PullResult[] = [];
  let current = collection;
  for (let i = 0; i < DRAWS_PER_TICKET; i++) {
    const applied = applyPull(current, pickFromPool(pool, rng));
    current = applied.collection;
    results.push(applied.result);
  }
  return { collection: current, results };
}

/** Calendar date (YYYY-MM-DD) in Asia/Taipei, which has no daylight saving. */
export function taipeiDate(now: Date): string {
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Whole Taipei calendar days between two YYYY-MM-DD dates (0 if `to` is not later). */
export function daysBetween(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86_400_000));
}
