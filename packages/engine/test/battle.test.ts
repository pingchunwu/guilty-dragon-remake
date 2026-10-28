import { describe, expect, it } from "vitest";
import {
  ITEM_KINDS,
  NO_EQUIPMENT,
  PLACEHOLDER_CARDS,
  PLACEHOLDER_DEFAULT_DECK,
  PLACEHOLDER_ITEMS,
  PLACEHOLDER_STARTER_LOADOUT,
  RULES_V0,
  RULES_V07,
  AI_STRATEGY_VERSION,
  aiSelect,
  deckCardIds,
  defenseOf,
  previewAttack,
  resolvePhase,
  startBattle,
  resolveEquipment,
  validateSelection,
  weaponAttackOf,
  type BattleState,
  type Equipment,
  type CardDefinition,
  type Cards,
  type Selection,
  type SideState,
} from "../src";

const cards: Cards = new Map(PLACEHOLDER_CARDS.map((c) => [c.id, c]));
/** The same cards without skills, so a final-blow guard in a hand can't change the deck-out totals checked below. */
const plainCards: Cards = new Map(PLACEHOLDER_CARDS.map((c) => [c.id, { ...c, skill: null }]));
const deck = deckCardIds(PLACEHOLDER_DEFAULT_DECK);
/** Armor 30 and no weapon, so the hand-checked numbers below stay simple. */
const armor = { id: "t-armor", name: "t", kind: "body" as const, attack: 0, defense: 30 };
const equipment: Equipment = { ...NO_EQUIPMENT, body: armor };
const setup = { deck, equipment };
const HP = RULES_V0.startingHp;

/** Same rules with HP high enough that deck-out is always reached. */
const LONG = { ...RULES_V0, startingHp: 100_000 };

const cardCount = (s: SideState) => s.drawPile.length + s.hand.length + s.discard.length;

/** Plays a whole battle with the AI strategy on both sides. */
function playOut(seed: [number, number, number, number], rules = RULES_V0) {
  let state = startBattle(seed, setup, setup, rules);
  const results = [];
  while (state.status === "active") {
    const selection = state.kind === "normal" ? aiSelect(state.sides.challenger.hand, cards, rules) : null;
    const step = resolvePhase(state, selection, cards, rules);
    results.push(step.result);
    state = step.state;
    for (const side of Object.values(state.sides)) expect(cardCount(side)).toBe(32);
    if (results.length > 5000) throw new Error("battle did not end");
  }
  return { state, results };
}

/** A tiny card set where every number is easy to check by hand. */
function fixture(defs: [string, CardDefinition["type"], number, number?, string?][]): Cards {
  return new Map(
    defs.map(([id, type, attack, draw = 2, skill = null]) => [id, { id, name: id, type, attack, draw, rarity: "N", skill }]),
  );
}

/** `n` cards named prefix1..prefixN of one colour. */
const many = (prefix: string, type: CardDefinition["type"], n: number, attack = 50): [string, CardDefinition["type"], number][] =>
  Array.from({ length: n }, (_, i) => [`${prefix}${i + 1}`, type, attack]);

const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);

function side(hand: string[], drawPile: string[]): SideState {
  return { hp: 1000, equipment, levels: {}, drawPile, hand, discard: [], ranOut: false };
}

function stateWith(challenger: SideState, defender: SideState): BattleState {
  return {
    ruleVersion: RULES_V0.ruleVersion,
    aiVersion: "test",
    rng: [1, 2, 3, 4],
    phase: 1,
    kind: "normal",
    sides: { challenger, defender },
    status: "active",
  };
}

/** A defender holding one weak magic card over a magic pile (its chain never draws). */
const quietDefender = () => side(["dm"], ids("dp", 10));
const quietCards: [string, CardDefinition["type"], number][] = [["dm", "magic", 1], ...many("dp", "magic", 10)];

describe("placeholder balance", () => {
  // shortcut: checks the starter armor only, since 0.6.0 cards (min 30) sit below the best 4-piece set (40);
  // rule 0.7.0-draft makes armor a percent and drops this check.
  it("keeps the starter armor below every card's attack so won phases always deal damage", () => {
    const minAttack = Math.min(...PLACEHOLDER_CARDS.map((c) => c.attack));
    const items = new Map(PLACEHOLDER_ITEMS.map((i) => [i.id, i]));
    expect(defenseOf(resolveEquipment(PLACEHOLDER_STARTER_LOADOUT, items))).toBeLessThan(minAttack);
  });
});

describe("weapons", () => {
  const sword = { id: "t-sword", name: "t", kind: "heavy" as const, attack: 25, defense: 0 };
  const armed: Equipment = { ...equipment, heavy: sword, light: { ...sword, kind: "light" as const, attack: 5 } };

  it("adds weapon attack after the combo and advantage multipliers", () => {
    // heavy beats light: (100 + 50) × 1.1 × 1.2 = 198, + 25 weapon = 223.
    const c = fixture([["h", "heavy", 100], ["h2", "heavy", 50], ["l", "light", 110], ...many("x", "magic", 12)]);
    const state = stateWith({ ...side(["h", "h2"], ids("x", 6)), equipment: armed }, side(["l"], ids("x", 12).slice(6)));
    const { result } = resolvePhase(state, { leader: "h", supports: ["h2"] }, c, RULES_V0);
    expect(result.sides.challenger).toMatchObject({ weaponAttack: 25, attack: 223 });
    expect(result.damage).toBe(223 - 30);
  });

  it("adds weapon attack to deck-out totals too", () => {
    const start = startBattle([3, 3, 3, 3], { deck, equipment: armed }, setup, RULES_V0);
    const out = { ...start.sides.challenger, drawPile: [], discard: start.sides.challenger.drawPile, ranOut: true };
    const total = out.hand.reduce((sum, id) => sum + cards.get(id)!.attack, 0);
    const { result } = resolvePhase({ ...start, kind: "deck_out", sides: { ...start.sides, challenger: out } }, null, cards, RULES_V0);
    expect(result.damage).toBe(total + 25);
  });

  it("resolves the starter loadout from the placeholder items", () => {
    const items = new Map(PLACEHOLDER_ITEMS.map((i) => [i.id, i]));
    const e = resolveEquipment(PLACEHOLDER_STARTER_LOADOUT, items);
    for (const kind of ITEM_KINDS) expect(e[kind]?.kind).toBe(kind);
    expect(weaponAttackOf(e)).toBe(300);
    expect(defenseOf(e)).toBe(8);
  });
});

describe("startBattle", () => {
  it("deals eight cards each and starts at full HP", () => {
    const state = startBattle([1, 2, 3, 4], setup, setup, RULES_V0);
    for (const s of Object.values(state.sides)) {
      expect(s.hand).toHaveLength(8);
      expect(s.drawPile).toHaveLength(24);
      expect(s.hp).toBe(HP);
    }
    expect(state.kind).toBe("normal");
  });
});

describe("validateSelection", () => {
  const hand = ["h1", "h2", "l1", "m1", "m2", "m3", "l2", "l3"];
  it("accepts five cards of any colour; other colours just block", () => {
    expect(validateSelection(hand, { leader: "h1", supports: ["h2", "l1", "m1", "m2"] }, RULES_V0)).toBeNull();
  });
  it("requires exactly five cards, or the whole hand when it is smaller", () => {
    expect(validateSelection(hand, { leader: "h1", supports: ["h2"] }, RULES_V0)).toBe("WRONG_COUNT");
    expect(validateSelection(hand, { leader: "h1", supports: ["h2", "l1", "m1", "m2", "m3"] }, RULES_V0)).toBe("WRONG_COUNT");
    expect(validateSelection(["h1", "h2"], { leader: "h1", supports: ["h2"] }, RULES_V0)).toBeNull();
  });
  it("rejects cards not in hand and duplicates", () => {
    expect(validateSelection(hand, { leader: "zz", supports: [] }, RULES_V0)).toBe("LEADER_NOT_IN_HAND");
    expect(validateSelection(hand, { leader: "h1", supports: ["zz", "l1", "m1", "m2"] }, RULES_V0)).toBe("SUPPORT_NOT_IN_HAND");
    expect(validateSelection(hand, { leader: "h1", supports: ["h1", "l1", "m1", "m2"] }, RULES_V0)).toBe("DUPLICATE");
  });
});

describe("attack", () => {
  it("applies the combo bonus with exact integer math, counting only the leader's colour", () => {
    const c = fixture([["a", "heavy", 70], ["b", "heavy", 80], ["c", "heavy", 90], ["d", "heavy", 100], ["e", "heavy", 41], ["x", "light", 99]]);
    expect(previewAttack(["a"], c, RULES_V0)).toBe(70);
    expect(previewAttack(["a", "b"], c, RULES_V0)).toBe(165); // 150 × 1.1
    expect(previewAttack(["a", "x", "b"], c, RULES_V0)).toBe(165); // x blocks
    expect(previewAttack(["a", "b", "c", "d", "e"], c, RULES_V0)).toBe(571); // 381 × 1.5 = 571.5
  });

  it("gives the advantaged side ×1.2 and the winner deals attack − armor", () => {
    // heavy beats light: challenger 100 × 1.2 = 120 vs defender 110. A lone leader draws nothing.
    const c = fixture([["h", "heavy", 100], ["l", "light", 110], ...many("x", "magic", 12)]);
    const { result, state } = resolvePhase(stateWith(side(["h"], ids("x", 6)), side(["l"], ids("x", 12).slice(6))), { leader: "h", supports: [] }, c, RULES_V0);
    expect(result.sides.challenger).toMatchObject({ attack: 120, advantage: true, chain: [{ card: "h", from: "pick", counted: true }] });
    expect(result.sides.defender).toMatchObject({ attack: 110, advantage: false });
    expect(result.winner).toBe("challenger");
    expect(result.damage).toBe(120 - armor.defense);
    expect(state.sides.defender.hp).toBe(1000 - 90);
  });

  it("deals no damage when attacks are equal", () => {
    const c = fixture([["h1", "heavy", 80], ["h2", "heavy", 80], ...many("x", "magic", 12)]);
    const { result, state } = resolvePhase(stateWith(side(["h1"], ids("x", 6)), side(["h2"], ids("x", 12).slice(6))), { leader: "h1", supports: [] }, c, RULES_V0);
    expect(result.winner).toBeNull();
    expect(result.damage).toBe(0);
    expect(state.sides.challenger.hp).toBe(1000);
    expect(state.sides.defender.hp).toBe(1000);
  });
});

describe("chain", () => {
  it("draws a card into the row each time a same-colour card merges", () => {
    // Leader h1, then h2, l1 (blocks, draws nothing), h3. The pile runs out mid-chain.
    const c = fixture([["h1", "heavy", 10], ["h2", "heavy", 20], ["l1", "light", 99], ["h3", "heavy", 30], ["h4", "heavy", 40], ["m1", "magic", 99], ["h5", "heavy", 50], ...quietCards]);
    const { result, state } = resolvePhase(
      stateWith(side(["h1", "h2", "l1", "h3"], ["h4", "m1", "h5"]), quietDefender()),
      { leader: "h1", supports: ["h2", "l1", "h3"] },
      c,
      RULES_V0,
    );
    const me = result.sides.challenger;
    expect(me.chain).toEqual([
      { card: "h1", from: "pick", counted: true },
      { card: "h2", from: "pick", counted: true },
      { card: "l1", from: "pick", counted: false },
      { card: "h3", from: "pick", counted: true },
      { card: "h4", from: "draw", counted: true },
      { card: "m1", from: "draw", counted: false },
      { card: "h5", from: "draw", counted: true },
    ]);
    expect(me.blocks).toBe(2);
    expect(me.played).toEqual(["h1", "h2", "h3", "h4", "h5"]);
    expect(me.attack).toBe(225); // 150 × 1.5
    // The deck hit 0 mid-chain, so the next phase is a deck-out phase.
    expect(state.sides.challenger.drawPile).toHaveLength(0);
    expect(state.sides.challenger.ranOut).toBe(true);
    expect(state.kind).toBe("deck_out");
  });

  it("counts at most five drawn cards", () => {
    const c = fixture([["lead", "heavy", 10], ["s", "heavy", 10], ...many("x", "heavy", 9, 10), ...quietCards]);
    const { result, state } = resolvePhase(
      stateWith(side(["lead", "s"], ids("x", 9)), quietDefender()),
      { leader: "lead", supports: ["s"] },
      c,
      RULES_V0,
    );
    const me = result.sides.challenger;
    expect(me.chain.filter((s) => s.from === "draw").map((s) => s.card)).toEqual(ids("x", 5));
    expect(me.played).toHaveLength(7);
    expect(me.combo).toBe(1.5); // capped
    expect(me.attack).toBe(105); // 70 × 1.5
    // x6..x9 refill the hand (two picks played, hand was 2, refills to 8 if possible).
    expect(state.sides.challenger.hand).toEqual(ids("x", 9).slice(5));
  });

  it("draws nothing when all four spaces hold other colours", () => {
    const c = fixture([["lead", "heavy", 10], ...many("l", "light", 4), ...many("x", "heavy", 9, 10), ...quietCards]);
    const { result, state } = resolvePhase(
      stateWith(side(["lead", ...ids("l", 4)], ids("x", 9)), quietDefender()),
      { leader: "lead", supports: ids("l", 4) },
      c,
      RULES_V0,
    );
    const me = result.sides.challenger;
    expect(me.chain.map((s) => s.card)).toEqual(["lead", "l1", "l2", "l3", "l4"]);
    expect(me.blocks).toBe(4);
    expect(me.played).toEqual(["lead"]);
    // Only the refill touched the deck: the emptied hand draws 8.
    expect(state.sides.challenger.hand).toEqual(ids("x", 8));
    expect(state.sides.challenger.drawPile).toEqual(["x9"]);
  });

  it("never holds more than four blockers", () => {
    for (let i = 0; i < 50; i++) {
      const { results } = playOut([i, 11, 22, 33]);
      for (const r of results) for (const s of Object.values(r.sides)) expect(s.blocks).toBeLessThanOrEqual(4);
    }
  });

  it("keeps unplayed cards in hand and refills only what was used", () => {
    const hand = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const c = fixture([...hand.map((id) => [id, "heavy", 50] as [string, "heavy", number]), ...many("m", "magic", 10), ...quietCards]);
    const { result, state } = resolvePhase(
      stateWith(side(hand, ids("m", 10)), quietDefender()),
      { leader: "a", supports: ["b", "c", "d", "e"] },
      c,
      RULES_V0,
    );
    // b..e each merge and draw m1..m4, which all block the four spaces.
    expect(result.sides.challenger.chain.map((s) => s.card)).toEqual(["a", "b", "c", "d", "e", "m1", "m2", "m3", "m4"]);
    expect(state.sides.challenger.hand).toEqual(["f", "g", "h", ...ids("m", 9).slice(4)]);
    expect(state.sides.challenger.discard).toEqual(["a", "b", "c", "d", "e", "m1", "m2", "m3", "m4"]);
    expect(state.sides.challenger.drawPile).toEqual(["m10"]);
  });
});

describe("aiSelect", () => {
  it("leads with its strongest colour and fills to five with its weakest other cards", () => {
    const c = fixture([["h1", "heavy", 50], ["h2", "heavy", 60], ["m1", "magic", 100], ["l1", "light", 40], ["l2", "light", 45], ["m2", "magic", 99], ["m3", "magic", 30]]);
    // heavy: 110 × 1.1 = 121; magic: 229 × 1.2 = 274; light: 85 × 1.1 = 93.
    expect(aiSelect(["h1", "h2", "m1", "l1", "l2", "m2", "m3"], c, RULES_V0)).toEqual({ leader: "m1", supports: ["m2", "m3", "l1", "l2"] });
  });

  it("under 0.7.0 leads the biggest colour with its highest DRAW, then charges that colour by POW", () => {
    const c = fixture([["h1", "heavy", 900, 1], ["h2", "heavy", 500, 4], ["h3", "heavy", 700, 4], ["m1", "magic", 2000, 6], ["m2", "magic", 1900], ["l1", "light", 300], ["l2", "light", 400], ["l3", "light", 100]]);
    // heavy and light have 3 cards; heavy has more POW. h3 beats h2 on POW at equal DRAW.
    expect(aiSelect(["h1", "h2", "h3", "m1", "m2", "l1", "l2", "l3"], c, RULES_V07)).toEqual({ leader: "h3", supports: ["h1", "h2", "l3", "l1"] });
  });

  it("records its strategy version per rule version", () => {
    expect(startBattle([1, 2, 3, 4], setup, setup, RULES_V0).aiVersion).toBe("0.4.0");
    expect(startBattle([1, 2, 3, 4], setup, setup, RULES_V07).aiVersion).toBe(AI_STRATEGY_VERSION);
  });
});

describe("deck-out", () => {
  it("happens once a deck hits 0 and resets the decks that ran out", () => {
    const { results } = playOut([3, 1, 4, 1], LONG);
    const first = results.findIndex((r) => r.kind === "deck_out");
    expect(first).toBeGreaterThan(0);
    expect(results.slice(0, first).every((r) => r.kind === "normal")).toBe(true);
    const out = results[first]!;
    expect(out.reshuffled.length).toBeGreaterThan(0);
    for (const id of out.reshuffled) expect(out.sides[id].ranOut).toBe(true);
  });

  /** Moves a side's draw pile to its discard so it has run out. */
  const runOut = (s: SideState): SideState => ({ ...s, drawPile: [], discard: s.drawPile, ranOut: true });

  it("compares hand totals when both run out, and resets both to full decks", () => {
    const start = startBattle([9, 9, 9, 9], setup, setup, LONG);
    const state: BattleState = {
      ...start,
      kind: "deck_out",
      sides: { challenger: runOut(start.sides.challenger), defender: runOut(start.sides.defender) },
    };
    const total = (s: SideState) => s.hand.reduce((sum, id) => sum + cards.get(id)!.attack, 0);
    const totals = { challenger: total(state.sides.challenger), defender: total(state.sides.defender) };
    const { result, state: next } = resolvePhase(state, null, plainCards, LONG);
    if (totals.challenger === totals.defender) {
      expect(result.damage).toBe(0);
    } else {
      const winner = totals.challenger > totals.defender ? "challenger" : "defender";
      const loser = winner === "challenger" ? "defender" : "challenger";
      expect(result.winner).toBe(winner);
      expect(result.damage).toBe(totals[winner] - armor.defense);
      expect(result.ignoredArmor).toBe(false);
      expect(next.sides[loser].hp).toBe(LONG.startingHp - result.damage);
    }
    expect(result.reshuffled.sort()).toEqual(["challenger", "defender"]);
    for (const s of Object.values(next.sides)) {
      expect(s.hand).toHaveLength(8);
      expect(s.drawPile).toHaveLength(24);
      expect(s.discard).toHaveLength(0);
    }
    expect(next.kind).toBe("normal");
  });

  it("lets a side that runs out alone hit for its hand total, ignoring armor", () => {
    const start = startBattle([2, 7, 1, 8], setup, setup, LONG);
    const defenderHand = start.sides.defender.hand;
    const state: BattleState = { ...start, kind: "deck_out", sides: { ...start.sides, challenger: runOut(start.sides.challenger) } };
    const total = state.sides.challenger.hand.reduce((s, id) => s + cards.get(id)!.attack, 0);
    const { result, state: next } = resolvePhase(state, null, plainCards, LONG);
    expect(result.winner).toBe("challenger");
    expect(result.damage).toBe(total);
    expect(result.ignoredArmor).toBe(true);
    expect(result.reshuffled).toEqual(["challenger"]);
    expect(next.sides.defender.hp).toBe(LONG.startingHp - total);
    expect(next.sides.defender.hand).toEqual(defenderHand);
    expect(next.sides.challenger.hand).toHaveLength(8);
    expect(cardCount(next.sides.challenger)).toBe(32);
  });
});

describe("whole battles", () => {
  it("are deterministic for the same seed and selections", () => {
    expect(playOut([1, 2, 3, 4])).toEqual(playOut([1, 2, 3, 4]));
  });

  it("survive a JSON round trip between phases", () => {
    let a = startBattle([5, 6, 7, 8], setup, setup, RULES_V0);
    let b = a;
    while (a.status === "active") {
      const pick = (s: BattleState): Selection | null =>
        s.kind === "normal" ? aiSelect(s.sides.challenger.hand, cards, RULES_V0) : null;
      a = resolvePhase(a, pick(a), cards, RULES_V0).state;
      b = resolvePhase(JSON.parse(JSON.stringify(b)), pick(b), cards, RULES_V0).state;
      expect(b).toEqual(a);
    }
  });

  it("keep going through repeated deck-outs until someone falls", () => {
    const { state, results } = playOut([8, 6, 7, 5], { ...RULES_V0, startingHp: 50_000 });
    expect(results.filter((r) => r.kind === "deck_out").length).toBeGreaterThan(1);
    expect(state.status).not.toBe("active");
  });

  it("always end with a winner across many seeds", () => {
    for (let i = 0; i < 300; i++) {
      const { state, results } = playOut([i, i * 7 + 1, i * 13 + 2, 99]);
      expect(state.status).not.toBe("active");
      expect(Math.min(state.sides.challenger.hp, state.sides.defender.hp)).toBe(0);
      expect(results.length).toBeLessThan(100);
    }
  });

  it("rejects resolving a finished battle or an invalid selection", () => {
    const { state } = playOut([4, 4, 4, 4]);
    expect(() => resolvePhase(state, null, cards, RULES_V0)).toThrow(/over/);
    const fresh = startBattle([4, 4, 4, 4], setup, setup, RULES_V0);
    expect(() => resolvePhase(fresh, { leader: "nope", supports: [] }, cards, RULES_V0)).toThrow(/LEADER_NOT_IN_HAND/);
  });
});

describe("rule 0.7.0-draft", () => {
  const v07 = (s: BattleState): BattleState => ({ ...s, ruleVersion: RULES_V07.ruleVersion });
  const weapon = (kind: "heavy" | "light" | "magic", attack: number) => ({ id: `t-${kind}`, name: "t", kind, attack, defense: 0 });
  /** A defender whose lone heavy leader (POW 1, DRAW 0) draws nothing and has no advantage over heavy. */
  const weakCards: [string, CardDefinition["type"], number, number?][] = [["dw", "heavy", 1, 0], ...many("dp", "magic", 10)];
  const weak = () => side(["dw"], ids("dp", 10));

  it("replays the OG clip: weapon + leader + 4 charge cards, then DRAW 3 off-colour draws", () => {
    const c = fixture([
      ["L", "heavy", 856, 3], ["a", "heavy", 1000], ["b", "heavy", 1200], ["c", "heavy", 1400], ["d", "heavy", 1532],
      ...many("m", "magic", 5), ["dh", "heavy", 100], ...many("dp", "magic", 10),
    ]);
    const armed: Equipment = { ...equipment, heavy: weapon("heavy", 1300), light: weapon("light", 999) };
    const state = v07(stateWith({ ...side(["L", "a", "b", "c", "d"], ids("m", 5)), equipment: armed }, side(["dh"], ids("dp", 10))));
    const { result, state: next } = resolvePhase(state, { leader: "L", supports: ["a", "b", "c", "d"] }, c, RULES_V07);
    const me = result.sides.challenger;
    expect(me.chain).toEqual([
      { card: "L", from: "pick", counted: true },
      ...["a", "b", "c", "d"].map((card) => ({ card, from: "pick", counted: true })),
      ...["m1", "m2", "m3"].map((card) => ({ card, from: "draw", counted: false })),
    ]);
    expect(me).toMatchObject({ drawLimit: 3, blocks: 3, weaponAttack: 1300, baseAttack: 5988, comboCount: 5, attack: 10932 }); // 7288 × 1.5
    expect(result.sides.defender).toMatchObject({ attack: 100, defense: 30, drawLimit: 2 });
    // (10932 − 100) × (100 − 30)% = 7582.4
    expect(result.damage).toBe(7582);
    expect(next.sides.challenger.discard).toEqual(["L", "a", "b", "c", "d", "m1", "m2", "m3"]);
  });

  it("lets off-colour charge cards block, and stops drawing once all four spaces are blocked", () => {
    const c = fixture([["h", "heavy", 10, 6], ["h2", "heavy", 20], ...many("l", "light", 3), ["m1", "magic", 99], ["h3", "heavy", 30], ["h4", "heavy", 40], ...weakCards]);
    const { result, state } = resolvePhase(
      v07(stateWith(side(["h", "l1", "l2", "l3", "h2"], ["m1", "h3", "h4"]), weak())),
      { leader: "h", supports: ["l1", "l2", "l3", "h2"] },
      c,
      RULES_V07,
    );
    expect(result.sides.challenger.chain.map((s) => [s.card, s.from, s.counted])).toEqual([
      ["h", "pick", true], ["l1", "pick", false], ["l2", "pick", false], ["l3", "pick", false], ["h2", "pick", true], ["m1", "draw", false],
    ]);
    expect(result.sides.challenger.blocks).toBe(4);
    expect(result.sides.challenger.attack).toBe(33); // 30 × 1.1
    // DRAW 6 was not used up, but h3 and h4 stay in the pile (and refill the hand).
    expect(state.sides.challenger.hand).toEqual(["h3", "h4"]);
  });

  it("draws into the free spaces of a short hand and stops when the deck is empty", () => {
    const c = fixture([["h", "heavy", 10, 6], ["l1", "light", 99], ["h3", "heavy", 30], ...many("m", "magic", 2), ...weakCards]);
    const { result } = resolvePhase(v07(stateWith(side(["h", "l1"], ["h3", "m1", "m2"]), weak())), { leader: "h", supports: ["l1"] }, c, RULES_V07);
    expect(result.sides.challenger.chain.filter((s) => s.from === "draw").map((s) => s.card)).toEqual(["h3", "m1", "m2"]);
    expect(result.sides.challenger.blocks).toBe(3);
  });

  it("floors after the colour multiplier, then after the combo", () => {
    // (57 + 50) × 1.2 = 128.4 → 128, × 1.1 = 140.8 → 140 (one multiply would give 141).
    const c = fixture([["h", "heavy", 57, 0], ["h2", "heavy", 50], ["l", "light", 10, 0], ...many("x", "magic", 12)]);
    const { result } = resolvePhase(v07(stateWith(side(["h", "h2"], ids("x", 6)), side(["l"], ids("x", 12).slice(6)))), { leader: "h", supports: ["h2"] }, c, RULES_V07);
    expect(result.sides.challenger).toMatchObject({ advantage: true, attack: 140 });
    expect(result.damage).toBe(91); // (140 − 10) × 70%
  });

  it("applies DRAW, 肅清 and cross-colour charge skills to the charge and draws", () => {
    const c = fixture([
      ["fm", "heavy", 10, 2, "friend-mail"], ["pg", "heavy", 10, 1, "purge-1"], ["cs", "heavy", 10, 1, "curse-support"],
      ...many("l", "light", 4), ["h3", "heavy", 30], ...many("m", "magic", 4), ...weakCards,
    ]);
    const run = (hand: string[], pile: string[]) =>
      resolvePhase(v07(stateWith(side(hand, pile), weak())), { leader: hand[0]!, supports: hand.slice(1) }, c, RULES_V07).result.sides.challenger;

    const mail = run(["fm"], ids("m", 4));
    expect(mail.drawLimit).toBe(3);
    expect(mail.chain.filter((s) => s.from === "draw")).toHaveLength(3);

    const purge = run(["pg", ...ids("l", 4)], ["h3", "m1"]);
    expect(purge.chain.find((s) => s.card === "l1")).toMatchObject({ purged: true });
    expect(purge.chain.at(-1)).toEqual({ card: "h3", from: "draw", counted: true });
    expect(purge.played).toEqual(["pg", "h3"]);

    const charge = run(["cs", "m1", "l1"], ["m2", "m3"]);
    expect(charge.chain.map((s) => s.counted)).toEqual([true, true, false, true]);
    expect(charge.played).toEqual(["cs", "m1", "m2"]);
  });

  it("adds defense skills to the defense % and takes the flat guard off last", () => {
    const c = fixture([["h", "heavy", 1000, 0], ["g", "heavy", 100, 0, "guard-1"], ["a", "heavy", 100, 0, "hard-armor-1"], ...many("x", "magic", 12)]);
    const hit = (defender: string) =>
      resolvePhase(v07(stateWith(side(["h"], ids("x", 6)), side([defender], ids("x", 12).slice(6)))), { leader: "h", supports: [] }, c, RULES_V07).result;
    expect(hit("g").damage).toBe(630 - 50); // 900 × 70% − guard
    const armored = hit("a");
    expect(armored.sides.defender.defense).toBe(31);
    expect(armored.damage).toBe(621); // 900 × 69%
  });

  const armed: Equipment = { ...equipment, heavy: weapon("heavy", 300), light: weapon("light", 200), magic: weapon("magic", 100) };
  const runOut = (s: SideState): SideState => ({ ...s, drawPile: [], discard: s.drawPile, ranOut: true });
  const handTotal = (s: SideState) => s.hand.reduce((sum, id) => sum + cards.get(id)!.attack, 0);
  const LONG07 = { ...RULES_V07, startingHp: 100_000 };

  it("hits for the hand total plus all three weapons on deck-out, ignoring defense", () => {
    const start = startBattle([3, 3, 3, 3], { deck, equipment: armed }, setup, LONG07);
    const out = runOut(start.sides.challenger);
    const { result } = resolvePhase({ ...start, kind: "deck_out", sides: { ...start.sides, challenger: out } }, null, cards, LONG07);
    expect(result.sides.challenger.weaponAttack).toBe(600);
    expect(result.damage).toBe(handTotal(out) + 600);
    expect(result.ignoredArmor).toBe(true);
  });

  it("lets the higher total hit in full when both run out", () => {
    const start = startBattle([9, 9, 9, 9], { deck, equipment: armed }, setup, LONG07);
    const sides = { challenger: runOut(start.sides.challenger), defender: runOut(start.sides.defender) };
    const totals = { challenger: handTotal(sides.challenger) + 600, defender: handTotal(sides.defender) };
    const { result } = resolvePhase({ ...start, kind: "deck_out", sides }, null, plainCards, LONG07);
    expect(result.damage).toBe(Math.max(totals.challenger, totals.defender));
    expect(result.ignoredArmor).toBe(true);
  });

  it("plays whole battles to a winner, deterministically", () => {
    expect(playOut([1, 2, 3, 4], RULES_V07)).toEqual(playOut([1, 2, 3, 4], RULES_V07));
    for (let i = 0; i < 100; i++) {
      const { state, results } = playOut([i, 5, 6, 7], RULES_V07);
      expect(state.status).not.toBe("active");
      for (const r of results) for (const s of Object.values(r.sides)) expect(s.blocks).toBeLessThanOrEqual(4);
    }
  });
});
