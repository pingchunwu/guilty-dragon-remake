import { beforeEach, describe, expect, it } from "vitest";
import {
  PLACEHOLDER_CARDS,
  PLACEHOLDER_DEFAULT_DECK,
  PLACEHOLDER_ITEMS,
  PLACEHOLDER_STARTER_LOADOUT,
  RULES_V0,
  SKILLS,
  cardMaxLevel,
  deckCardIds,
  validateDeck,
  validateLoadout,
  type Deck,
  type Loadout,
} from "@gdr/engine";
import { ALICE, BOB, as, createDb, db, rpc } from "./pglite";

beforeEach(createDb);

const sync = (uid: string) => rpc(uid, "public.sync_player()");
const draw = (uid: string, key: string) => rpc(uid, "public.draw_ten($1)", [key]);
const drawItems = (uid: string, key: string) => rpc(uid, "public.draw_items_ten($1)", [key]);
const saveLoadout = (uid: string, l: Loadout) => rpc(uid, "public.save_loadout($1, $2, $3)", [l.armor, l.weapon, l.gear]);
const saveDeck = (uid: string, kind: string, deck: Deck) =>
  rpc(uid, "public.save_deck($1::public.deck_kind, $2::jsonb)", [kind, JSON.stringify(deck)]);

describe("auth", () => {
  it("rejects anonymous callers", async () => {
    await expect(rpc(null, "public.sync_player()", [])).rejects.toThrow(/NOT_AUTHENTICATED/);
    await expect(as(null, (tx) => tx.query("select public.sync_player()"), "anon")).rejects.toThrow(/permission denied/);
  });

  it("does not expose internal helpers", async () => {
    await expect(rpc(ALICE, "public.player_state($1)", [ALICE])).rejects.toThrow(/permission denied/);
  });
});

describe("sync_player", () => {
  it("grants the default deck and starting tickets exactly once", async () => {
    const first = await sync(ALICE);
    expect(first.tickets).toBe(1);
    expect(Object.keys(first.cards)).toHaveLength(32);
    expect(first.decks).toEqual({ attack: PLACEHOLDER_DEFAULT_DECK, defense: PLACEHOLDER_DEFAULT_DECK });

    const second = await sync(ALICE);
    expect(second).toEqual(first);
  });

  it("accrues one ticket per missed Taipei day", async () => {
    await sync(ALICE);
    await db.exec(`update public.players set last_ticket_date = last_ticket_date - 3 where id = '${ALICE}'`);
    expect((await sync(ALICE)).tickets).toBe(4);
    expect((await sync(ALICE)).tickets).toBe(4);
  });
});

describe("draw_ten", () => {
  it("spends one ticket for ten results and replays the same key without charging", async () => {
    await sync(ALICE);
    const first = await draw(ALICE, "key-00000001");
    expect(first.results).toHaveLength(10);
    expect(first.state.tickets).toBe(0);
    expect(first.replayed).toBe(false);

    const retry = await draw(ALICE, "key-00000001");
    expect(retry.results).toEqual(first.results);
    expect(retry.state.tickets).toBe(0);
    expect(retry.replayed).toBe(true);

    await expect(draw(ALICE, "key-00000002")).rejects.toThrow(/INSUFFICIENT_TICKETS/);
  });

  it("requires a synced player", async () => {
    await expect(draw(BOB, "key-00000001")).rejects.toThrow(/PLAYER_NOT_FOUND/);
  });

  it("levels up once per duplicate up to the skill's cap, then keeps shards", async () => {
    await sync(ALICE);
    // Force the pool to a single card Alice already owns, with a level cap of 3.
    const owned = deckCardIds(PLACEHOLDER_DEFAULT_DECK);
    const card = PLACEHOLDER_CARDS.find((c) => owned.includes(c.id) && cardMaxLevel(c) === 3)!;
    await db.exec(`update public.pool_entries set weight = case when card_id = '${card.id}' then 1 else 0 end`);
    const { results, state } = await draw(ALICE, "key-00000001");
    expect(results.every((r: any) => r.id === card.id && !r.isNew)).toBe(true);
    expect(results.filter((r: any) => r.leveledUp)).toHaveLength(2);
    expect(state.cards[card.id]).toEqual({ level: 3, shards: 8 });
  });

  it("adds new cards to the collection", async () => {
    await sync(ALICE);
    const owned = deckCardIds(PLACEHOLDER_DEFAULT_DECK);
    const card = PLACEHOLDER_CARDS.find((c) => !owned.includes(c.id) && cardMaxLevel(c) === 10)!;
    await db.exec(`update public.pool_entries set weight = case when card_id = '${card.id}' then 1 else 0 end`);
    const { results, state } = await draw(ALICE, "key-00000001");
    expect(results[0]).toEqual({ id: card.id, isNew: true, level: 1, shards: 0, leveledUp: false });
    expect(state.cards[card.id]).toEqual({ level: 10, shards: 0 });
  });

  it("caps item levels at 10", async () => {
    await sync(ALICE);
    await db.exec(`update public.item_pool_entries set weight = case when item_id = 'ph-weapon-01' then 1 else 0 end;
                   update public.player_items set level = 9 where item_id = 'ph-weapon-01'`);
    const { state } = await drawItems(ALICE, "key-00000002");
    expect(state.items["ph-weapon-01"]).toEqual({ level: 10, shards: 9 });
  });
});

describe("content", () => {
  it("stores cards, skills and item stats from the engine catalog", async () => {
    const cards = await db.query("select id, name, type, attack, rarity, skill_id as skill from public.card_definitions");
    expect(cards.rows).toEqual(expect.arrayContaining([...PLACEHOLDER_CARDS]));
    expect(cards.rows).toHaveLength(PLACEHOLDER_CARDS.length);
    const skills = await db.query<{ id: string; max_level: number }>("select id, max_level from public.skill_definitions");
    expect(Object.fromEntries(skills.rows.map((r) => [r.id, r.max_level]))).toEqual(
      Object.fromEntries(SKILLS.map((k) => [k.id, k.maxLevel])),
    );
    const active = await db.query("select id from public.card_pools where active");
    expect(active.rows).toEqual([{ id: "pool-v1" }]);
    const items = await db.query("select id, name, kind::text as kind, attack, defense from public.item_definitions order by id");
    expect(items.rows).toEqual(expect.arrayContaining([...PLACEHOLDER_ITEMS]));
    expect(items.rows).toHaveLength(PLACEHOLDER_ITEMS.length);
  });
});

describe("equipment", () => {
  it("grants and equips the starter items, also for players created before equipment", async () => {
    const first = await sync(ALICE);
    expect(first.loadout).toEqual(PLACEHOLDER_STARTER_LOADOUT);
    expect(Object.keys(first.items).sort()).toEqual(Object.values(PLACEHOLDER_STARTER_LOADOUT).sort());

    await db.exec(`delete from public.loadouts; delete from public.player_items;`);
    expect((await sync(ALICE)).loadout).toEqual(PLACEHOLDER_STARTER_LOADOUT);
  });

  it("draws ten items for one ticket and keeps card and item keys apart", async () => {
    await sync(ALICE);
    const first = await drawItems(ALICE, "key-00000001");
    expect(first.results).toHaveLength(10);
    expect(first.state.tickets).toBe(0);
    for (const r of first.results) expect(first.state.items[r.id]).toBeDefined();
    await expect(draw(ALICE, "key-00000001")).rejects.toThrow(/IDEMPOTENCY_KEY_REUSED/);
  });

  it("saves an owned loadout and reports the same errors as the engine", async () => {
    await sync(ALICE);
    expect(await saveLoadout(ALICE, { ...PLACEHOLDER_STARTER_LOADOUT, gear: null })).toEqual({ ok: true, errors: [] });
    expect((await sync(ALICE)).loadout.gear).toBeNull();

    const bad: Loadout = { armor: "ph-weapon-01", weapon: "ph-weapon-06", gear: "nope" };
    const items = new Map(PLACEHOLDER_ITEMS.map((i) => [i.id, i]));
    const expected = validateLoadout(bad, items, new Set(Object.values(PLACEHOLDER_STARTER_LOADOUT) as string[]));
    const result = await saveLoadout(ALICE, bad);
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining(expected));
    expect(result.errors).toHaveLength(expected.length);
  });
});

describe("save_deck", () => {
  it("saves a valid deck", async () => {
    await sync(ALICE);
    const deck = { ...PLACEHOLDER_DEFAULT_DECK, free: [...PLACEHOLDER_DEFAULT_DECK.free].reverse() };
    expect(await saveDeck(ALICE, "defense", deck)).toEqual({ ok: true, errors: [] });
    expect((await sync(ALICE)).decks.defense).toEqual(deck);
  });

  it("reports the same errors as the engine validator", async () => {
    await sync(ALICE);
    const deck: Deck = {
      heavy: [...PLACEHOLDER_DEFAULT_DECK.heavy.slice(0, 7), "ph-magic-01"],
      light: PLACEHOLDER_DEFAULT_DECK.light.slice(0, 7),
      magic: [...PLACEHOLDER_DEFAULT_DECK.magic.slice(0, 7), "ph-magic-16"],
      free: [...PLACEHOLDER_DEFAULT_DECK.free.slice(0, 7), "nope"],
    };
    const owned = new Set((Object.values(PLACEHOLDER_DEFAULT_DECK) as string[][]).flat());
    const cards = new Map(PLACEHOLDER_CARDS.map((c) => [c.id, c]));
    const expected = validateDeck(deck, cards, RULES_V0, owned);

    const result = await saveDeck(ALICE, "attack", deck);
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining(expected));
    expect(result.errors).toHaveLength(expected.length);
    expect((await sync(ALICE)).decks.attack).toEqual(PLACEHOLDER_DEFAULT_DECK);
  });
});

describe("row-level security", () => {
  it("only shows a player their own rows and blocks direct writes", async () => {
    await sync(ALICE);
    await sync(BOB);
    const visible = await as(ALICE, (tx) => tx.query<{ n: number }>("select count(distinct player_id)::int as n from public.player_cards"));
    expect(visible.rows[0]!.n).toBe(1);

    await expect(
      as(ALICE, (tx) => tx.query("update public.players set tickets = 999 where id = $1", [ALICE])),
    ).rejects.toThrow(/permission denied/);
    await expect(
      as(ALICE, (tx) => tx.query("insert into public.player_cards (player_id, card_id) values ($1, 'ph-magic-16')", [ALICE])),
    ).rejects.toThrow(/permission denied/);
    await expect(
      as(ALICE, (tx) => tx.query("update public.loadouts set weapon_id = 'ph-weapon-06' where player_id = $1", [ALICE])),
    ).rejects.toThrow(/permission denied/);
  });

  it("lets anyone read public card content", async () => {
    const res = await as(null, (tx) => tx.query<{ n: number }>("select count(*)::int as n from public.card_definitions"), "anon");
    expect(res.rows[0]!.n).toBe(PLACEHOLDER_CARDS.length);
  });
});
