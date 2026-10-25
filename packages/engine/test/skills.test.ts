import { describe, expect, it } from "vitest";
import {
  NO_EQUIPMENT,
  PLACEHOLDER_CARDS,
  RULES_V0,
  SKILLS,
  aiSelect,
  cardMaxLevel,
  leveledItem,
  resolvePhase,
  skillValue,
  skillOf,
  startBattle,
  type BattleState,
  type CardType,
  type Cards,
  type Equipment,
  type SideState,
} from "../src";

type Def = [id: string, type: CardType, attack: number, skill?: string];

function cardsOf(defs: Def[]): Cards {
  return new Map(
    defs.map(([id, type, attack, skill]) => [id, { id, name: id, type, attack, rarity: "N", skill: skill ?? null }]),
  );
}

const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);
const many = (prefix: string, type: CardType, n: number, attack = 10): Def[] =>
  ids(prefix, n).map((id) => [id, type, attack]);

/** Shared cards: heavy fillers h*, magic blockers m*, heavy draws p*, weak magic defender d. */
const BASE: Def[] = [
  ...many("h", "heavy", 5, 50),
  ...many("m", "magic", 8),
  ...many("p", "heavy", 10),
  ["d", "magic", 1],
];

interface SideOptions {
  hand: string[];
  pile?: string[];
  levels?: Record<string, number>;
  hp?: number;
  equipment?: Equipment;
}

function sideOf(o: SideOptions): SideState {
  return {
    hp: o.hp ?? 1000,
    equipment: o.equipment ?? NO_EQUIPMENT,
    levels: o.levels ?? {},
    drawPile: o.pile ?? [],
    hand: o.hand,
    discard: [],
    ranOut: false,
  };
}

/** One normal phase; the challenger plays the first five hand cards in order (leader first). */
function phase(extra: Def[], challenger: SideOptions, defender: SideOptions = { hand: ["d"] }) {
  const cards = cardsOf([...BASE, ...extra]);
  const state: BattleState = {
    ruleVersion: RULES_V0.ruleVersion,
    aiVersion: "test",
    rng: [1, 2, 3, 4],
    phase: 1,
    kind: "normal",
    sides: { challenger: sideOf(challenger), defender: sideOf(defender) },
    status: "active",
  };
  const [leader, ...supports] = challenger.hand.slice(0, RULES_V0.maxSelected);
  return resolvePhase(state, { leader: leader!, supports }, cards, RULES_V0);
}

/** Skilled leader alone plus four magic blockers: base attack 50, one counted card. */
const lone = (skill: string, level = 1, more: Partial<SideOptions> = {}) =>
  phase([["L", "heavy", 50, skill]], { hand: ["L", ...ids("m", 4)], levels: { L: level }, ...more });

describe("skill catalog", () => {
  it("gives every skill exactly one placeholder card and a sane level cap", () => {
    const used = PLACEHOLDER_CARDS.map((c) => c.skill);
    expect(new Set(used).size).toBe(SKILLS.length);
    expect(new Set(SKILLS.map((s) => s.id)).size).toBe(SKILLS.length);
    for (const s of SKILLS) expect([1, 3, 5, 10]).toContain(s.maxLevel);
  });

  it("caps card levels at the skill's max and scales per level", () => {
    const card = PLACEHOLDER_CARDS.find((c) => c.skill === "rengeki")!;
    expect(cardMaxLevel(card)).toBe(3);
    expect(skillValue(skillOf("power-up-2"), 3)).toBe(12);
    expect(skillValue(skillOf("rengeki"), 9)).toBe(3);
    expect(skillValue(skillOf("ranbu"), 1)).toBe(3);
  });

  it("plays whole battles with every placeholder card without losing cards", () => {
    const cards: Cards = new Map(PLACEHOLDER_CARDS.map((c) => [c.id, c]));
    const all = PLACEHOLDER_CARDS.map((c) => c.id);
    const levels = Object.fromEntries(all.map((id) => [id, 10]));
    for (let seed = 1; seed <= 12; seed++) {
      const deck = (offset: number) => Array.from({ length: 32 }, (_, i) => all[(i * 7 + offset + seed) % all.length]!);
      let state = startBattle(
        [seed, 2, 3, 4],
        { deck: deck(0), equipment: NO_EQUIPMENT, levels },
        { deck: deck(3), equipment: NO_EQUIPMENT, levels },
        RULES_V0,
      );
      for (let n = 0; state.status === "active"; n++) {
        if (n > 500) throw new Error("battle did not end");
        const selection = state.kind === "normal" ? aiSelect(state.sides.challenger.hand, cards, RULES_V0) : null;
        state = resolvePhase(state, selection, cards, RULES_V0).state;
        for (const s of Object.values(state.sides)) {
          expect(s.drawPile.length + s.hand.length + s.discard.length).toBe(32);
          expect(s.hp).toBeGreaterThanOrEqual(0);
          expect(s.hp).toBeLessThanOrEqual(RULES_V0.startingHp);
        }
      }
    }
  });
});

describe("combo skills", () => {
  it("連擊 adds its level to the combo count, capped at the skill max", () => {
    expect(lone("rengeki", 2).result.sides.challenger).toMatchObject({ comboCount: 3, combo: 1.2, attack: 60 });
    expect(lone("rengeki", 9).result.sides.challenger).toMatchObject({ comboCount: 4, attack: 65 });
  });

  it("看穿 lowers the enemy's combo but never below one card", () => {
    const defender = { hand: ["k"] };
    const full = phase([["k", "magic", 1, "mikiri"]], { hand: ids("h", 5) }, defender);
    expect(full.result.sides.challenger).toMatchObject({ comboCount: 4, combo: 1.3, attack: 325 });
    const alone = phase([["k", "magic", 1, "mind-eye"]], { hand: ["h1", ...ids("m", 4)] }, { ...defender, levels: { k: 5 } });
    expect(alone.result.sides.challenger).toMatchObject({ comboCount: 1, attack: 50 });
  });
});

describe("attack and defense skills", () => {
  const sword = { id: "w", name: "w", kind: "weapon" as const, attack: 10, defense: 0 };

  it("percent attack applies to the weapon too; flat attack is added after", () => {
    expect(lone("soul-breath", 2).result.sides.challenger).toMatchObject({ attack: 60, skillAttack: 10 });
    const armed = lone("soul-breath", 2, { equipment: { ...NO_EQUIPMENT, weapon: sword } });
    expect(armed.result.sides.challenger.attack).toBe(72);
    expect(lone("power-up-3", 2).result.sides.challenger.attack).toBe(62);
  });

  it("enemy attack-down skills come off the other side", () => {
    const defender = (skill: string) => ({ hand: ["k"], extra: [["k", "magic", 1, skill]] as Def[] });
    const run = (skill: string) =>
      phase(defender(skill).extra, { hand: ["h1", ...ids("m", 4)] }, { hand: ["k"] }).result.sides.challenger.attack;
    expect(run("disarm")).toBe(42);
    expect(run("arms-curse")).toBe(0);
    expect(run("belly-laugh")).toBe(20);
  });

  it("defense skills scale armor; 不惜身命 trades defense for attack", () => {
    const armor = { id: "a", name: "a", kind: "armor" as const, attack: 0, defense: 30 };
    const equipment = { ...NO_EQUIPMENT, armor };
    expect(lone("silver-crown", 1, { equipment }).result.sides.challenger.defense).toBe(42);
    expect(lone("reckless", 1, { equipment }).result.sides.challenger).toMatchObject({ attack: 80, defense: 25 });
    const pierced = phase([["k", "magic", 1, "armor-pierce"]], { hand: ["h1", ...ids("m", 4)], equipment }, {
      hand: ["k"],
      levels: { k: 2 },
    });
    expect(pierced.result.sides.challenger.defense).toBe(25);
  });

  it("共鬥 and 同鄉之友 count blockers and same-colour cards", () => {
    expect(lone("joint-fight", 2).result.sides.challenger.attack).toBe(50 + 60 * 4);
    const same = phase([["L", "heavy", 50, "hometown"]], { hand: ["L", "h2", "h3", "m1", "m2"], levels: { L: 3 } });
    expect(same.result.sides.challenger.attack).toBe(Math.floor(150 * 1.2) + 30 * 2);
  });
});

describe("damage and HP skills", () => {
  it("final damage adds to a won phase and the loser's guard takes it off", () => {
    const won = phase(
      [
        ["L", "heavy", 50, "plus-damage-2"],
        ["k", "magic", 1, "guard-1"],
      ],
      { hand: ["L", ...ids("m", 4)], levels: { L: 2 } },
      { hand: ["k"], levels: { k: 3 } },
    );
    expect(won.result).toMatchObject({ winner: "challenger", damage: 50 + 20 - 15 });
    expect(lone("war-hammer", 2).result.damage).toBe(60);
  });

  it("heals up to max HP, pays HP for attack, and direct damage stops at 1 HP", () => {
    const healed = lone("healing-water-2", 3, { hp: 2990 }).result;
    expect(healed.sides.challenger.healed).toBe(10);
    const paid = lone("price-of-violence-1", 2).result;
    expect(paid.sides.challenger).toMatchObject({ hpCost: 20, attack: 70 });
    expect(paid.hpAfter.challenger).toBe(980);
    const hit = lone("prank", 1, {});
    expect(hit.result.sides.defender.hpDamageTaken).toBe(80);
    const weak = phase([["L", "heavy", 50, "prank"]], { hand: ["L", ...ids("m", 4)] }, { hand: ["d"], hp: 30 });
    expect(weak.result.sides.defender.hpDamageTaken).toBe(29);
  });
});

describe("colour skills", () => {
  // Heavy challenger against a magic defender: the defender has the advantage.
  const vs = (mine?: string, theirs?: string) =>
    phase(
      [
        ["L", "heavy", 50, mine],
        ["k", "magic", 100, theirs],
      ] as Def[],
      { hand: ["L", ...ids("m", 4)] },
      { hand: ["k"] },
    ).result.sides;

  it("天秤 removes advantage, 凌駕 forces it, 不調 cancels the enemy's", () => {
    expect(vs().defender.advantageMultiplier).toBe(1.2);
    expect(vs("balance-art").defender.advantageMultiplier).toBe(1);
    expect(vs("surpass-art").challenger.advantageMultiplier).toBe(1.2);
    expect(vs("slump-art").defender.advantageMultiplier).toBe(1);
  });

  it("王者風範 lets every colour merge", () => {
    const sides = lone("regal").result.sides;
    expect(sides.challenger).toMatchObject({ blocks: 0, baseAttack: 90, comboCount: 5, attack: 135 });
  });
});

describe("counter skills", () => {
  const duel = (mine: string, theirs: string, level = 1) =>
    phase(
      [
        ["L", "heavy", 50, mine],
        ["k", "magic", 1, theirs],
      ],
      { hand: ["L", ...ids("m", 4)], levels: { L: level } },
      { hand: ["k"] },
    ).result.sides;

  it("護盾 cancels the enemy skill, but two shields cancel nothing", () => {
    expect(duel("rengeki", "shield").challenger).toMatchObject({ comboCount: 1, skill: { id: "rengeki", blocked: true } });
    expect(duel("shield", "shield").challenger.skill).toMatchObject({ blocked: false });
  });

  it("模仿 uses the enemy skill at its own level", () => {
    const c = duel("mimic", "rengeki", 2).challenger;
    expect(c.skill).toEqual({ id: "rengeki", level: 2, via: "mimic", blocked: false });
    expect(c.comboCount).toBe(3);
  });
});

describe("chain and hand skills", () => {
  it("肅清 removes blockers when the field is full so the chain draws on", () => {
    const run = phase([["L", "heavy", 50, "purge-2"]], { hand: ["L", ...ids("m", 4)], pile: ids("p", 10), levels: { L: 2 } });
    const c = run.result.sides.challenger;
    expect(c.chain.filter((s) => s.purged).map((s) => s.card)).toEqual(["m1", "m2"]);
    expect(c.blocks).toBe(2);
    expect(c.played).toEqual(["L", "p1", "p2", "p3", "p4", "p5"]);
  });

  it("挾擊 cuts the enemy's chain draws", () => {
    const run = phase([["k", "magic", 1, "pincer"]], { hand: ids("h", 5), pile: ids("p", 10) }, { hand: ["k"], levels: { k: 3 } });
    expect(run.result.sides.challenger.played).toHaveLength(7);
  });

  it("誘餌 discards other-colour cards from the rest of the hand, not the picks", () => {
    const run = phase([["L", "heavy", 50, "decoy"]], {
      hand: ["L", ...ids("m", 4), "h2", "m5", "m6"],
      levels: { L: 2 },
      pile: ids("p", 20),
    });
    const c = run.state.sides.challenger;
    expect(c.discard).toEqual(expect.arrayContaining(["m5", "m6"]));
    expect(c.hand).toContain("h2");
  });
});

describe("final blow guard", () => {
  it("reduces deck-out damage from a card held in the hand", () => {
    const cards = cardsOf([...BASE, ["g", "magic", 1, "slim-hope-1"]]);
    const state: BattleState = {
      ruleVersion: RULES_V0.ruleVersion,
      aiVersion: "test",
      rng: [1, 2, 3, 4],
      phase: 3,
      kind: "deck_out",
      sides: {
        challenger: { ...sideOf({ hand: ids("h", 5) }), ranOut: true },
        defender: sideOf({ hand: ["g"], pile: ids("p", 5), levels: { g: 2 } }),
      },
      status: "active",
    };
    const { result } = resolvePhase(state, null, cards, RULES_V0);
    expect(result).toMatchObject({ winner: "challenger", damage: 250 - 40 });
    expect(result.sides.defender.skill).toMatchObject({ id: "slim-hope-1", level: 2 });
  });
});

describe("item levels", () => {
  it("adds 10% of base stats per level, capped at level 10", () => {
    const armor = { id: "a", name: "a", kind: "armor" as const, attack: 0, defense: 20 };
    expect(leveledItem(armor, 3).defense).toBe(24);
    expect(leveledItem(armor, 99).defense).toBe(38);
  });
});
