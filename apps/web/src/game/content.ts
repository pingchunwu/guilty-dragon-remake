import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ITEM_KINDS,
  PLACEHOLDER_CARDS,
  PLACEHOLDER_ITEMS,
  type CardDefinition,
  type CardType,
  type ItemDefinition,
  type ItemKind,
} from "@gdr/engine";
import { GameError } from "./types";

/** Card and item definitions, keyed by ID. The database is the source of truth. */
export interface Content {
  cards: ReadonlyMap<string, CardDefinition>;
  items: ReadonlyMap<string, ItemDefinition>;
}

const CARD_TYPES: readonly CardType[] = ["heavy", "light", "magic"];

/** Used only when the app is built without Supabase settings (guest-only mode). */
export const PLACEHOLDER_CONTENT: Content = {
  cards: new Map(PLACEHOLDER_CARDS.map((c) => [c.id, c])),
  items: new Map(PLACEHOLDER_ITEMS.map((i) => [i.id, i])),
};

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;

function toCard(row: Record<string, unknown>): CardDefinition {
  const { id, name, type, attack } = row;
  if (typeof id !== "string" || typeof name !== "string" || !CARD_TYPES.includes(type as CardType) || !isInt(attack)) {
    throw new GameError("CONTENT_INVALID");
  }
  return { id, name, type: type as CardType, attack };
}

function toItem(row: Record<string, unknown>): ItemDefinition {
  const { id, name, kind, attack, defense } = row;
  if (
    typeof id !== "string" ||
    typeof name !== "string" ||
    !ITEM_KINDS.includes(kind as ItemKind) ||
    !isInt(attack) ||
    !isInt(defense)
  ) {
    throw new GameError("CONTENT_INVALID");
  }
  return { id, name, kind: kind as ItemKind, attack, defense };
}

/** Maps `card_definitions` / `item_definitions` rows; throws on a malformed or empty table. */
export function parseContent(cardRows: readonly Record<string, unknown>[], itemRows: readonly Record<string, unknown>[]): Content {
  if (cardRows.length === 0 || itemRows.length === 0) throw new GameError("CONTENT_MISSING");
  return {
    cards: new Map(cardRows.map(toCard).map((c) => [c.id, c])),
    items: new Map(itemRows.map(toItem).map((i) => [i.id, i])),
  };
}

async function select(client: SupabaseClient, table: string, columns: string): Promise<Record<string, unknown>[]> {
  let result;
  try {
    result = await client.from(table).select(columns).order("id");
  } catch {
    throw new GameError("NETWORK", true);
  }
  if (result.error) throw new GameError(result.error.code ? "UNKNOWN" : "NETWORK", true);
  return (result.data ?? []) as unknown as Record<string, unknown>[];
}

let cached: Promise<Content> | null = null;

/**
 * Loads content once per page load and keeps it in memory only (the service
 * worker never caches API responses). A failed load is not kept, so calling
 * again retries.
 */
export function loadContent(client: SupabaseClient | null): Promise<Content> {
  if (!client) return Promise.resolve(PLACEHOLDER_CONTENT);
  cached ??= Promise.all([
    select(client, "card_definitions", "id, name, type, attack"),
    select(client, "item_definitions", "id, name, kind, attack, defense"),
  ]).then(([cards, items]) => parseContent(cards, items));
  cached.catch(() => {
    cached = null;
  });
  return cached;
}
