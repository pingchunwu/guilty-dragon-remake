import { FunctionsHttpError, type SupabaseClient } from "@supabase/supabase-js";
import type { CardDefinition, Equipment, PhaseResult, Selection, SideId } from "@gdr/engine";
import { call } from "./supabase";
import { GameError } from "./types";

export interface PvpPlayer {
  id: string;
  name: string;
  /** In my friend list (added by friend code). */
  friend: boolean;
}

/** The challenger's view of a battle; the server never sends the seed, draw piles or the defender's hand. */
export interface PvpBattle {
  id: string;
  opponent: { id: string; name: string };
  status: "active" | "challenger_won" | "defender_won";
  endReason: "hp" | "surrender" | "timeout" | null;
  phase: number;
  kind: "normal" | "deck_out";
  /** Act before this or lose by timeout. */
  deadline: string;
  serverNow: string;
  hp: Record<SideId, number>;
  equipment: Record<SideId, Equipment>;
  hand: string[];
  drawPile: Record<SideId, number>;
  ranOut: Record<SideId, boolean>;
  last: PhaseResult | null;
  /** Definitions as snapshotted at battle start, for the cards shown. */
  cards: Record<string, CardDefinition>;
  levels: Record<string, number>;
}

export interface PvpHistoryEntry {
  id: string;
  role: "challenger" | "defender";
  opponent: { id: string; name: string };
  won: boolean;
  endReason: "hp" | "surrender" | "timeout";
  phase: number;
  hp: Record<SideId, number>;
  finishedAt: string;
}

export interface PvpLobby {
  me: { id: string; name: string; friendCode: string };
  /** Every other player, friends first. */
  players: PvpPlayer[];
  active: PvpBattle | null;
  history: PvpHistoryEntry[];
}

export interface PvpService {
  lobby(): Promise<PvpLobby>;
  setName(name: string): Promise<PvpLobby>;
  addFriend(code: string): Promise<PvpLobby>;
  removeFriend(id: string): Promise<PvpLobby>;
  surrender(): Promise<PvpLobby>;
  start(opponentId: string): Promise<PvpBattle>;
  play(phase: number, selection: Selection | null): Promise<PvpBattle>;
}

/** Battles run in the `pvp` Edge Function; everything else is a database function. */
export function createPvpService(client: SupabaseClient): PvpService {
  async function invoke(body: Record<string, unknown>): Promise<PvpBattle> {
    const { data, error } = await client.functions.invoke<PvpBattle>("pvp", { body });
    if (!error) return data!;
    if (error instanceof FunctionsHttpError) {
      const code = await (error.context as Response)
        .json()
        .then((b: { error?: string }) => b.error)
        .catch(() => undefined);
      throw new GameError(code ?? "UNKNOWN", code === "SERVER_ERROR");
    }
    throw new GameError("NETWORK", true);
  }

  return {
    lobby: () => call(client, "pvp_lobby"),
    setName: (name) => call(client, "pvp_set_name", { p_name: name }),
    addFriend: (code) => call(client, "pvp_add_friend", { p_code: code }),
    removeFriend: (id) => call(client, "pvp_remove_friend", { p_friend: id }),
    surrender: () => call(client, "pvp_surrender"),
    start: (opponentId) => invoke({ action: "start", opponentId }),
    play: (phase, selection) => invoke({ action: "play", phase, selection }),
  };
}
