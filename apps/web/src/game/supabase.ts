import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { GameError, type GameService, type PlayerState } from "./types";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Null when the app is built without Supabase settings (guest-only mode). */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;

const KNOWN_ERRORS = [
  "INSUFFICIENT_TICKETS",
  "PLAYER_NOT_FOUND",
  "NOT_AUTHENTICATED",
  "NO_ACTIVE_POOL",
  "CONFIG_MISSING",
  "IDEMPOTENCY_KEY_REUSED",
  "NAME_TOO_LONG",
  "FRIEND_NOT_FOUND",
  "FRIEND_IS_SELF",
  "NO_ACTIVE_BATTLE",
];

export async function call<T>(client: SupabaseClient, fn: string, args?: Record<string, unknown>): Promise<T> {
  let result;
  try {
    result = await client.rpc(fn, args);
  } catch {
    throw new GameError("NETWORK", true);
  }
  if (result.error) {
    const known = KNOWN_ERRORS.find((code) => result.error.message.includes(code));
    // No Postgres error code usually means the request never reached the database.
    throw new GameError(known ?? "UNKNOWN", !known && !result.error.code);
  }
  return result.data as T;
}

export function createAccountService(client: SupabaseClient): GameService {
  return {
    mode: "account",
    sync: () => call<PlayerState>(client, "sync_player"),
    drawTen: (idempotencyKey) => call(client, "draw_ten", { p_idempotency_key: idempotencyKey }),
    drawItems: (idempotencyKey) => call(client, "draw_items_ten", { p_idempotency_key: idempotencyKey }),
    saveDeck: (kind, deck) => call(client, "save_deck", { p_kind: kind, p_slots: deck }),
    saveLoadout: (l) => call(client, "save_loadout", { p_armor: l.armor, p_weapon: l.weapon, p_gear: l.gear }),
  };
}
