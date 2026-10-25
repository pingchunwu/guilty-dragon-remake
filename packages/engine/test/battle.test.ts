import { describe, expect, it } from "vitest";
import {
  PLACEHOLDER_CARDS,
  PLACEHOLDER_DEFAULT_DECK,
  PLACEHOLDER_STARTER_ARMOR,
  RULES_V0,
  aiSelect,
  deckCardIds,
  previewAttack,
  resolvePhase,
  startBattle,
  validateSelection,
  type BattleState,
  type CardDefinition,
  type Cards,
  type Selection,
} from "../src";

const cards: Cards = new Map(PLACEHOLDER_CARDS.map((c) => [c.id, c]));
const deck = deckCardIds(PLACEHOLDER_DEFAULT_DECK);
const armor = PLACEHOLDER_STARTER_ARMOR;
const setup = { deck, armor };

/** Plays a whole battle with the AI strategy on both sides. */
/** Same rules with HP high enough that deck-out is always reached. */
const LONG = { ...RULES_V0, startingHp: 100_000 };

function playOut(seed: [number, number, number, number], rules = RULES_V0) {
  let state = startBattle(seed, setup, setup, rules);
  const results = [];
  while (state.status === "active") {
    const selection = state.kind === "normal" ? aiSelect(state.sides.challenger.hand, cards, rules) : null;
    const step = resolvePhase(state, selection, cards, rules);
    results.push(step.result);
    state = step.state;
    if (results.length > 5000) throw new Error("battle did not end");
  }
  return { state, results };
}

/** A tiny card set where every number is easy to check by hand. */
function fixture(defs: [string, CardDefinition["type"], number][]): Cards {
  return new Map(defs.map(([id, type, attack]) => [id, { id, name: id, type, attack }]));
}

function stateWithHands(challengerHand: string[], defenderHand: string[]): BattleState {
  const side = (hand: string[]) => ({ hp: 1000, armor, drawPile: ["x1", "x2", "x3", "x4", "x5", "x6"], hand, discard: [], ranOut: false });
  return {
    ruleVersion: RULES_V0.ruleVersion,
    aiVersion: "test",
    rng: [1, 2, 3, 4],
    phase: 1,
    kind: "normal",
    sides: { challenger: side(challengerHand), defender: side(defenderHand) },
    status: "active",
  };
}

describe("placeholder balance", () => {
  it("keeps armor below every card's attack so won phases always deal damage", () => {
    const minAttack = Math.min(...PLACEHOLDER_CARDS.map((c) => c.attack));
    expect(armor.defense).toBeLessThan(minAttack);
  });
});

describe("startBattle", () => {
  it("deals five cards each and starts at full HP", () => {
    const state = startBattle([1, 2, 3, 4], setup, setup, RULES_V0);
    for (const side of Object.values(state.sides)) {
      expect(side.hand).toHaveLength(5);
      expect(side.drawPile).toHaveLength(27);
      expect(side.hp).toBe(1000);
    }
    expect(state.kind).toBe("normal");
  });
});

describe("validateSelection", () => {
  const c = fixture([["h1", "heavy", 50], ["h2", "heavy", 60], ["l1", "light", 70]]);
  const hand = ["h1", "h2", "l1"];
  it("accepts a leader with same-colour supports", () => {
    expect(validateSelection(hand, { leader: "h1", supports: ["h2"] }, c, RULES_V0)).toBeNull();
  });
  it("rejects other colours, cards not in hand and duplicates", () => {
    expect(validateSelection(hand, { leader: "h1", supports: ["l1"] }, c, RULES_V0)).toBe("WRONG_COLOUR");
    expect(validateSelection(hand, { leader: "zz", supports: [] }, c, RULES_V0)).toBe("LEADER_NOT_IN_HAND");
    expect(validateSelection(hand, { leader: "h1", supports: ["h1"] }, c, RULES_V0)).toBe("DUPLICATE");
  });
});

describe("attack", () => {
  it("applies the combo bonus with exact integer math", () => {
    const c = fixture([["a", "heavy", 70], ["b", "heavy", 80], ["c", "heavy", 90], ["d", "heavy", 100], ["e", "heavy", 41]]);
    expect(previewAttack(["a"], c, RULES_V0)).toBe(70);
    expect(previewAttack(["a", "b"], c, RULES_V0)).toBe(165); // 150 × 1.1
    expect(previewAttack(["a", "b", "c", "d", "e"], c, RULES_V0)).toBe(571); // 381 × 1.5 = 571.5
  });

  it("gives the advantaged side ×1.2 and the winner deals attack − armor", () => {
    // heavy beats light: challenger 100 × 1.2 = 120 vs defender 110.
    const c = fixture([["h", "heavy", 100], ["l", "light", 110], ...["x1", "x2", "x3", "x4", "x5", "x6"].map((id) => [id, "magic", 50] as [string, "magic", number])]);
    const { result, state } = resolvePhase(stateWithHands(["h"], ["l"]), { leader: "h", supports: [] }, c, RULES_V0);
    expect(result.sides.challenger).toMatchObject({ attack: 120, advantage: true });
    expect(result.sides.defender).toMatchObject({ attack: 110, advantage: false });
    expect(result.winner).toBe("challenger");
    expect(result.damage).toBe(120 - armor.defense);
    expect(state.sides.defender.hp).toBe(1000 - 90);
  });

  it("deals no damage when attacks are equal", () => {
    const c = fixture([["h1", "heavy", 80], ["h2", "heavy", 80], ...["x1", "x2", "x3", "x4", "x5", "x6"].map((id) => [id, "magic", 50] as [string, "magic", number])]);
    const { result, state } = resolvePhase(stateWithHands(["h1"], ["h2"]), { leader: "h1", supports: [] }, c, RULES_V0);
    expect(result.winner).toBeNull();
    expect(result.damage).toBe(0);
    expect(state.sides.challenger.hp).toBe(1000);
    expect(state.sides.defender.hp).toBe(1000);
  });
});

describe("aiSelect", () => {
  it("plays all cards of its strongest colour, highest attack as leader", () => {
    const c = fixture([["h1", "heavy", 50], ["h2", "heavy", 60], ["m1", "magic", 100], ["l1", "light", 40], ["l2", "light", 45]]);
    // heavy: 110 × 1.1 = 121; magic: 100; light: 85 × 1.1 = 93.
    expect(aiSelect(["h1", "h2", "m1", "l1", "l2"], c, RULES_V0)).toEqual({ leader: "h2", supports: ["h1"] });
  });
});

describe("deck-out", () => {
  it("happens to both sides in phase 7 with 32-card decks, then both decks reset", () => {
    const { results } = playOut([3, 1, 4, 1], LONG);
    const first = results.find((r) => r.kind === "deck_out")!;
    expect(results.slice(0, 6).every((r) => r.kind === "normal")).toBe(true);
    expect(first.phase).toBe(7);
    expect(first.sides.challenger.played).toHaveLength(2);
    expect(first.reshuffled.sort()).toEqual(["challenger", "defender"]);
  });

  it("compares totals when both run out, and resets both to full decks", () => {
    let state = startBattle([9, 9, 9, 9], setup, setup, RULES_V0);
    // Skip ahead by emptying both draw piles so phase 1 is a deck-out phase.
    state = {
      ...state,
      kind: "deck_out",
      sides: {
        challenger: { ...state.sides.challenger, drawPile: [], ranOut: true, discard: state.sides.challenger.drawPile },
        defender: { ...state.sides.defender, drawPile: [], ranOut: true, discard: state.sides.defender.drawPile },
      },
    };
    const totals = {
      challenger: state.sides.challenger.hand.reduce((s, id) => s + cards.get(id)!.attack, 0),
      defender: state.sides.defender.hand.reduce((s, id) => s + cards.get(id)!.attack, 0),
    };
    const { result, state: next } = resolvePhase(state, null, cards, RULES_V0);
    if (totals.challenger === totals.defender) {
      expect(result.damage).toBe(0);
    } else {
      const winner = totals.challenger > totals.defender ? "challenger" : "defender";
      const loser = winner === "challenger" ? "defender" : "challenger";
      expect(result.winner).toBe(winner);
      expect(result.damage).toBe(totals[winner] - armor.defense);
      expect(result.ignoredArmor).toBe(false);
      expect(next.sides[loser].hp).toBe(1000 - result.damage);
    }
    for (const side of Object.values(next.sides)) {
      expect(side.drawPile.length + side.hand.length).toBe(32);
      expect(side.discard).toHaveLength(0);
    }
  });

  it("lets a side that runs out alone hit for its full total, ignoring armor", () => {
    // A 30-card challenger deck runs out in phase 6; the 32-card defender does not.
    const shortDeck = deck.slice(0, 30);
    let state = startBattle([2, 7, 1, 8], { deck: shortDeck, armor }, setup, LONG);
    let result;
    while (state.status === "active" && state.kind === "normal") {
      ({ state, result } = resolvePhase(state, aiSelect(state.sides.challenger.hand, cards, LONG), cards, LONG));
    }
    expect(state.status).toBe("active");
    expect(state.phase).toBe(6);
    expect(state.sides.challenger.ranOut).toBe(true);
    expect(state.sides.defender.ranOut).toBe(false);
    const total = state.sides.challenger.hand.reduce((s, id) => s + cards.get(id)!.attack, 0);
    const defenderHp = state.sides.defender.hp;
    ({ state, result } = resolvePhase(state, null, cards, LONG));
    expect(result!.winner).toBe("challenger");
    expect(result!.damage).toBe(total);
    expect(result!.ignoredArmor).toBe(true);
    expect(result!.reshuffled).toEqual(["challenger"]);
    expect(state.sides.defender.hp).toBe(defenderHp - total);
    expect(state.sides.challenger.drawPile.length + state.sides.challenger.hand.length).toBe(30);
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
    const { state, results } = playOut([8, 6, 7, 5], { ...RULES_V0, startingHp: 5_000 });
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
