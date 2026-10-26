import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import {
  PLACEHOLDER_CARDS,
  RULES_V0,
  RULES_V07,
  aiSelect,
  resolveEquipment,
  resolvePhase,
  startBattle,
  type BattleState,
  type RngState,
} from "@gdr/engine";
import { DB_ERRORS, PvpError, handle, parseRequest, type PvpDb, type PvpRequest } from "../functions/pvp/logic";
import { ENGINE_BUNDLE, bundleEngine } from "../scripts/bundle-engine";
import { ALICE, BOB, CAROL, as, createDb, db, rpc } from "./pglite";

const cards = new Map(PLACEHOLDER_CARDS.map((c) => [c.id, c]));
// A seed whose battle reaches a deck-out (about 3 in 4 do at starter gear).
const SEED: RngState = [12, 22, 33, 44];

/** The Edge Function's database adapter, over PGlite as the service role. */
function serviceCall<T>(fn: string, args: unknown[]): Promise<T> {
  const params = args.map((a) => (a !== null && typeof a === "object" ? JSON.stringify(a) : a));
  const sql = `public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")})`;
  return rpc<T>(null, sql, params, "service_role").catch((e: unknown) => {
    const known = DB_ERRORS.find((code) => String(e).includes(code));
    throw known ? new PvpError(known) : e;
  });
}

const pgDb: PvpDb = {
  prepare: (c, d) => serviceCall("pvp_prepare", [c, d]),
  create: (c, d, snapshot, seed, state) => serviceCall("pvp_create", [c, d, snapshot, seed, state]),
  load: (c) => serviceCall("pvp_load", [c]),
  recordPhase: (id, phase, selection, result, state) =>
    serviceCall("pvp_record_phase", [id, phase, selection, result, state]),
};

const call = (uid: string, request: PvpRequest) => handle(pgDb, uid, request, () => SEED) as Promise<any>;
const start = (uid: string, opponentId: string) => call(uid, { action: "start", opponentId });
const lobby = (uid: string) => rpc(uid, "public.pvp_lobby()");

/** Plays the challenger's phase with the defender AI's own strategy. */
function play(uid: string, view: any) {
  const selection = view.kind === "normal" ? aiSelect(view.hand, cards, RULES_V07) : null;
  return call(uid, { action: "play", phase: view.phase, selection });
}

beforeEach(async () => {
  await createDb();
  await rpc(ALICE, "public.sync_player()");
  await rpc(BOB, "public.sync_player()");
});

describe("names and friends", () => {
  it("shows emails until a name is set and lists every other player", async () => {
    const first = await lobby(ALICE);
    expect(first.me.name).toBe("alice@example.com");
    expect(first.me.friendCode).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(first.players).toEqual([{ id: BOB, name: "bob@example.com", friend: false }]);
    expect(first.active).toBeNull();
    expect(first.history).toEqual([]);
    expect((await lobby(ALICE)).me.friendCode).toBe(first.me.friendCode);

    expect((await rpc(BOB, "public.pvp_set_name($1)", ["  龍騎士  "])).me.name).toBe("龍騎士");
    expect((await lobby(ALICE)).players[0].name).toBe("龍騎士");
    await expect(rpc(BOB, "public.pvp_set_name($1)", ["x".repeat(21)])).rejects.toThrow(/NAME_TOO_LONG/);
    expect((await rpc(BOB, "public.pvp_set_name($1)", [""])).me.name).toBe("bob@example.com");
  });

  it("adds friends by code and lists them first", async () => {
    await rpc(CAROL, "public.sync_player()");
    const bobCode = (await lobby(BOB)).me.friendCode;
    expect((await lobby(ALICE)).players.map((p: any) => p.id)).toEqual([BOB, CAROL]);

    await rpc(ALICE, "public.pvp_set_name($1)", ["Zed"]);
    await rpc(CAROL, "public.pvp_set_name($1)", ["Amy"]);
    const after = await rpc(ALICE, "public.pvp_add_friend($1)", [` ${bobCode.toLowerCase()} `]);
    expect(after.players).toEqual([
      { id: BOB, name: "bob@example.com", friend: true },
      { id: CAROL, name: "Amy", friend: false },
    ]);
    // One-directional.
    expect((await lobby(BOB)).players.every((p: any) => !p.friend)).toBe(true);

    await expect(rpc(ALICE, "public.pvp_add_friend($1)", ["NOPE2345"])).rejects.toThrow(/FRIEND_NOT_FOUND/);
    await expect(rpc(ALICE, "public.pvp_add_friend($1)", [after.me.friendCode])).rejects.toThrow(/FRIEND_IS_SELF/);
    const removed = await rpc(ALICE, "public.pvp_remove_friend($1)", [BOB]);
    expect(removed.players.every((p: any) => !p.friend)).toBe(true);
  });

  it("requires a synced player", async () => {
    await expect(lobby(CAROL)).rejects.toThrow(/PLAYER_NOT_FOUND/);
  });
});

describe("battles", () => {
  it("starts a battle and shows only what the challenger may see", async () => {
    const view = await start(ALICE, BOB);
    expect(view).toMatchObject({
      opponent: { id: BOB, name: "bob@example.com" },
      status: "active",
      endReason: null,
      phase: 1,
      kind: "normal",
      ruleVersion: "0.7.0-draft",
      hp: { challenger: 3000, defender: 3000 },
      drawPile: { challenger: 24, defender: 24 },
      ranOut: { challenger: false, defender: false },
      last: null,
    });
    expect(view.hand).toHaveLength(8);
    expect(Object.keys(view).sort()).toEqual(
      ["cards", "deadline", "drawPile", "endReason", "equipment", "hand", "hp", "id", "kind", "last", "levels",
        "opponent", "phase", "ranOut", "ruleVersion", "serverNow", "status"].sort(),
    );
    expect(JSON.stringify(view)).not.toMatch(/rng|seed|discard/);
    for (const id of view.hand) expect(view.cards[id]).toEqual(cards.get(id));
    expect(Date.parse(view.deadline) - Date.parse(view.serverNow)).toBe(60_000);
    expect((await lobby(ALICE)).active).toEqual({ ...view, serverNow: expect.any(String) });
  });

  it("allows one unfinished battle at a time and checks the opponent", async () => {
    await expect(start(ALICE, ALICE)).rejects.toThrow("CANNOT_CHALLENGE_SELF");
    await expect(start(ALICE, CAROL)).rejects.toThrow("OPPONENT_NOT_FOUND");
    await start(ALICE, BOB);
    await expect(start(ALICE, BOB)).rejects.toThrow("BATTLE_IN_PROGRESS");
    // Bob may challenge Alice while she challenges him.
    await start(BOB, ALICE);
  });

  it("plays a battle to the end, reproducibly, and records it for both players", async () => {
    let view = await start(ALICE, BOB);
    let phases = 0;
    let deckOuts = 0;
    while (view.status === "active") {
      if (view.kind === "deck_out") deckOuts++;
      view = await play(ALICE, view);
      phases++;
      expect(view.last.phase).toBe(phases);
      expect(phases).toBeLessThan(100);
    }
    expect(view.endReason).toBe("hp");
    expect(deckOuts).toBeGreaterThan(0);
    expect(Math.min(view.hp.challenger, view.hp.defender)).toBe(0);
    expect((await lobby(ALICE)).active).toBeNull();

    const aliceHistory = (await lobby(ALICE)).history;
    const bobHistory = (await lobby(BOB)).history;
    expect(aliceHistory).toHaveLength(1);
    expect(aliceHistory[0]).toMatchObject({ id: view.id, role: "challenger", opponent: { id: BOB }, phase: phases });
    expect(bobHistory[0]).toMatchObject({ id: view.id, role: "defender", opponent: { id: ALICE } });
    expect(bobHistory[0].won).toBe(!aliceHistory[0].won);
    expect(aliceHistory[0].won).toBe(view.status === "challenger_won");

    // Audit: the stored seed, snapshot and selections replay to the stored state.
    const secret = (await db.query<any>("select seed, snapshot, state from public.pvp_battle_secrets")).rows[0];
    const steps = (await db.query<any>("select selection from public.pvp_phases order by phase")).rows;
    const items = new Map(Object.entries<any>(secret.snapshot.items));
    const side = (s: any) => ({ deck: s.deck, equipment: resolveEquipment(s.loadout, items, s.itemLevels), levels: s.levels });
    let state: BattleState = startBattle(secret.seed, side(secret.snapshot.challenger), side(secret.snapshot.defender), RULES_V07);
    for (const { selection } of steps) state = resolvePhase(state, selection, cards, RULES_V07).state;
    expect(state).toEqual(secret.state);
    expect(steps).toHaveLength(phases);
  });

  it("shows the 0.7.0 playback fields but not the defender's hand or draw pile", async () => {
    const view = await start(ALICE, BOB);
    expect((await pgDb.load(ALICE)).state.ruleVersion).toBe(RULES_V07.ruleVersion);
    const next = await play(ALICE, view);
    const secret = (await db.query<any>("select state from public.pvp_battle_secrets")).rows[0].state;
    for (const id of ["challenger", "defender"]) {
      const s = next.last.sides[id];
      expect(s.chain[0]).toMatchObject({ from: "pick", counted: true });
      expect(s.chain.every((c: any) => c.from === "pick" || c.from === "draw")).toBe(true);
      for (const key of ["drawLimit", "weaponAttack", "defense"]) expect(typeof s[key]).toBe("number");
      expect(["heavy", "light", "magic"]).toContain(s.leaderType);
      for (const c of s.chain) expect(next.cards[c.card]).toEqual(cards.get(c.card));
    }
    // Both decks hold the same card IDs, so look for the hidden lists, not single IDs.
    const text = JSON.stringify(next);
    for (const ids of [secret.sides.defender.hand, secret.sides.defender.drawPile, secret.sides.challenger.drawPile]) {
      expect(text).not.toContain(JSON.stringify(ids.slice(0, 3)).slice(1, -1));
    }
    expect(text).not.toMatch(/"(rng|seed|discard)"/);
  });

  it("keeps resolving stored 0.6.0-draft battles with the old rules", async () => {
    const view = await start(ALICE, BOB);
    const secret = (await db.query<any>("select seed, snapshot from public.pvp_battle_secrets")).rows[0];
    const items = new Map(Object.entries<any>(secret.snapshot.items));
    const side = (s: any) => ({ deck: s.deck, equipment: resolveEquipment(s.loadout, items, s.itemLevels), levels: s.levels });
    const old = startBattle(secret.seed, side(secret.snapshot.challenger), side(secret.snapshot.defender), RULES_V0);
    await db.query("update public.pvp_battle_secrets set state = $1", [JSON.stringify({ ...old, ruleVersion: "0.1.0" })]);
    await expect(play(ALICE, view)).rejects.toThrow("RULE_VERSION_RETIRED");

    await db.query("update public.pvp_battle_secrets set state = $1, rule_version = $2", [JSON.stringify(old), RULES_V0.ruleVersion]);
    const selection = aiSelect(old.sides.challenger.hand, cards, RULES_V0);
    const next = await call(ALICE, { action: "play", phase: view.phase, selection });
    expect(next.last).toEqual(resolvePhase(old, selection, cards, RULES_V0).result);
  });

  it("applies each phase once and validates the selection on the server", async () => {
    const view = await start(ALICE, BOB);
    const [leader, ...rest] = view.hand as string[];
    await expect(call(ALICE, { action: "play", phase: 1, selection: { leader: "ph-magic-16", supports: rest.slice(0, 4) } }))
      .rejects.toThrow("INVALID_SELECTION");
    await expect(call(ALICE, { action: "play", phase: 1, selection: { leader: leader!, supports: rest.slice(0, 2) } }))
      .rejects.toThrow("INVALID_SELECTION");
    await expect(call(ALICE, { action: "play", phase: 1, selection: null })).rejects.toThrow("INVALID_SELECTION");

    const next = await play(ALICE, view);
    expect(next.phase).toBe(2);
    await expect(play(ALICE, view)).rejects.toThrow("PHASE_CONFLICT");
    await expect(serviceCall("pvp_record_phase", [view.id, 1, null, {}, {}])).rejects.toThrow("PHASE_CONFLICT");
    expect((await db.query("select * from public.pvp_phases")).rows).toHaveLength(1);
  });

  it("counts surrender as a loss", async () => {
    await start(ALICE, BOB);
    const after = await rpc(ALICE, "public.pvp_surrender()");
    expect(after.active).toBeNull();
    expect(after.history[0]).toMatchObject({ role: "challenger", won: false, endReason: "surrender" });
    expect((await lobby(BOB)).history[0]).toMatchObject({ role: "defender", won: true, endReason: "surrender" });
    await expect(rpc(ALICE, "public.pvp_surrender()")).rejects.toThrow(/NO_ACTIVE_BATTLE/);
  });

  it("loses by timeout one minute (plus grace) after the last action", async () => {
    const view = await start(ALICE, BOB);
    await db.exec("update public.pvp_battles set deadline = now() - interval '3 seconds'");
    const late = await play(ALICE, view);
    expect(late.status).toBe("active");

    await db.exec("update public.pvp_battles set deadline = now() - interval '6 seconds'");
    await expect(play(ALICE, late)).rejects.toThrow("NO_ACTIVE_BATTLE");
    const after = await lobby(ALICE);
    expect(after.active).toBeNull();
    expect(after.history[0]).toMatchObject({ won: false, endReason: "timeout", phase: 2 });
  });

  it("ends the battle when a phase is recorded after the deadline", async () => {
    const view = await start(ALICE, BOB);
    const loaded = await pgDb.load(ALICE);
    await db.exec("update public.pvp_battles set deadline = now() - interval '6 seconds'");
    const step = resolvePhase(loaded.state, aiSelect(view.hand, cards, RULES_V07), cards, RULES_V07);
    const result: any = await pgDb.recordPhase(loaded.battleId, 1, null, step.result, step.state);
    expect(result).toMatchObject({ status: "defender_won", endReason: "timeout", phase: 1 });
  });
});

describe("security", () => {
  it("keeps battle internals away from players", async () => {
    const view = await start(ALICE, BOB);
    for (const sql of [
      `public.pvp_prepare('${ALICE}', '${BOB}')`,
      `public.pvp_load('${ALICE}')`,
      `public.pvp_create('${ALICE}', '${BOB}', '{}', '[]', '{}')`,
      `public.pvp_record_phase('${view.id}', 1, null, '{}', '{}')`,
      `public.pvp_view('${view.id}')`,
    ]) {
      await expect(rpc(ALICE, sql)).rejects.toThrow(/permission denied/);
    }
    await expect(as(ALICE, (tx) => tx.query("select * from public.pvp_battle_secrets"))).rejects.toThrow(/permission denied/);
    await expect(as(ALICE, (tx) => tx.query("select * from public.pvp_phases"))).rejects.toThrow(/permission denied/);
    await expect(
      as(ALICE, (tx) => tx.query("update public.pvp_battles set status = 'challenger_won', end_reason = 'hp'")),
    ).rejects.toThrow(/permission denied/);
  });

  it("shows a battle row to both participants only", async () => {
    await rpc(CAROL, "public.sync_player()");
    await start(ALICE, BOB);
    const count = (uid: string) =>
      as(uid, (tx) => tx.query<{ n: number }>("select count(*)::int as n from public.pvp_battles")).then((r) => r.rows[0]!.n);
    expect(await count(ALICE)).toBe(1);
    expect(await count(BOB)).toBe(1);
    expect(await count(CAROL)).toBe(0);
  });

  it("hides the defender's kept hand after a one-sided deck-out", async () => {
    const result = {
      kind: "deck_out",
      sides: {
        challenger: { played: ["a"], attack: 100, baseAttack: 90, ranOut: true },
        defender: { played: ["x", "y"], attack: 150, baseAttack: 140, ranOut: false },
      },
    };
    const shown = (await db.query<any>("select public.pvp_public_result($1) as r", [JSON.stringify(result)])).rows[0].r;
    expect(shown.sides.defender).toEqual({ played: [], attack: 0, baseAttack: 0, ranOut: false });
    expect(shown.sides.challenger).toEqual(result.sides.challenger);
  });

  it("rejects malformed requests", () => {
    for (const body of [null, {}, { action: "start" }, { action: "play", phase: "1" }, { action: "play", phase: 1, selection: { leader: 1 } }]) {
      expect(() => parseRequest(body)).toThrow("BAD_REQUEST");
    }
    expect(parseRequest({ action: "play", phase: 3, selection: null })).toEqual({ action: "play", phase: 3, selection: null });
  });
});

describe("engine bundle", () => {
  it("is up to date with packages/engine (run npm run gen:engine)", async () => {
    expect(readFileSync(ENGINE_BUNDLE, "utf8").replaceAll("\r\n", "\n")).toBe(await bundleEngine());
  });
});
