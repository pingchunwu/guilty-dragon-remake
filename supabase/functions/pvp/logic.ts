// Friend PvP battle logic, independent of Deno and HTTP so tests can run it
// against PGlite. The database (pvp_* service-role functions) stores state;
// this module runs the engine, which the database cannot.
import {
  RULES_V0,
  resolveEquipment,
  resolvePhase,
  startBattle,
  type BattleState,
  type CardDefinition,
  type ItemDefinition,
  type Loadout,
  type RngState,
  type Selection,
} from "../_shared/engine.js";

export interface SideSnapshot {
  /** Card IDs in slot order; the battle shuffles them with the seed. */
  deck: string[];
  levels: Record<string, number>;
  loadout: Loadout;
  itemLevels: Record<string, number>;
}

/** Both decks, card definitions and equipment as they were at creation. */
export interface Snapshot {
  challenger: SideSnapshot;
  defender: SideSnapshot;
  cards: Record<string, CardDefinition>;
  items: Record<string, ItemDefinition>;
}

/** The sanitized battle view built by the database's pvp_view. */
export type BattleView = Record<string, unknown>;

/** The pvp_* service-role database functions. */
export interface PvpDb {
  prepare(challenger: string, defender: string): Promise<Snapshot>;
  create(challenger: string, defender: string, snapshot: Snapshot, seed: RngState, state: BattleState): Promise<BattleView>;
  load(challenger: string): Promise<{ battleId: string; phase: number; snapshot: Snapshot; state: BattleState }>;
  recordPhase(
    battleId: string,
    phase: number,
    selection: Selection | null,
    result: unknown,
    state: BattleState,
  ): Promise<BattleView>;
}

export type PvpRequest =
  | { action: "start"; opponentId: string }
  | { action: "play"; phase: number; selection: Selection | null };

/** Error codes returned to the client; database errors use the same codes. */
export class PvpError extends Error {
  constructor(
    readonly code: string,
    readonly status = 400,
  ) {
    super(code);
  }
}

export const DB_ERRORS = [
  "PLAYER_NOT_FOUND",
  "CANNOT_CHALLENGE_SELF",
  "BATTLE_IN_PROGRESS",
  "OPPONENT_NOT_FOUND",
  "DECK_MISSING",
  "OPPONENT_NO_DECK",
  "NO_ACTIVE_BATTLE",
  "PHASE_CONFLICT",
];

const isString = (v: unknown): v is string => typeof v === "string";

/** Validates the untrusted request body. */
export function parseRequest(body: unknown): PvpRequest {
  const b = (body ?? {}) as Record<string, unknown>;
  if (b.action === "start" && isString(b.opponentId)) return { action: "start", opponentId: b.opponentId };
  if (b.action === "play" && Number.isInteger(b.phase)) {
    const s = b.selection as Record<string, unknown> | null | undefined;
    if (s == null) return { action: "play", phase: b.phase as number, selection: null };
    if (isString(s.leader) && Array.isArray(s.supports) && s.supports.every(isString)) {
      return { action: "play", phase: b.phase as number, selection: { leader: s.leader, supports: s.supports } };
    }
  }
  throw new PvpError("BAD_REQUEST");
}

function contentOf(snapshot: Snapshot) {
  return {
    cards: new Map(Object.entries(snapshot.cards)),
    items: new Map(Object.entries(snapshot.items)),
  };
}

/** Runs one request for the signed-in `player`. */
export async function handle(
  db: PvpDb,
  player: string,
  request: PvpRequest,
  randomSeed: () => RngState,
): Promise<BattleView> {
  if (request.action === "start") {
    const snapshot = await db.prepare(player, request.opponentId);
    const { items } = contentOf(snapshot);
    const seed = randomSeed();
    const side = (s: SideSnapshot) => ({
      deck: s.deck,
      equipment: resolveEquipment(s.loadout, items, s.itemLevels),
      levels: s.levels,
    });
    const state = startBattle(seed, side(snapshot.challenger), side(snapshot.defender), RULES_V0);
    return db.create(player, request.opponentId, snapshot, seed, state);
  }

  const battle = await db.load(player);
  if (battle.phase !== request.phase) throw new PvpError("PHASE_CONFLICT", 409);
  if (battle.state.ruleVersion !== RULES_V0.ruleVersion) throw new PvpError("RULE_VERSION_RETIRED", 409);
  const selection = battle.state.kind === "normal" ? request.selection : null;
  if (battle.state.kind === "normal" && !selection) throw new PvpError("INVALID_SELECTION");
  let step;
  try {
    step = resolvePhase(battle.state, selection, contentOf(battle.snapshot).cards, RULES_V0);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("invalid selection")) throw new PvpError("INVALID_SELECTION");
    throw e;
  }
  return db.recordPhase(battle.battleId, battle.phase, selection, step.result, step.state);
}
