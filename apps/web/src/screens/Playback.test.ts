import { describe, expect, it } from "vitest";
import {
  PLACEHOLDER_CARDS,
  PLACEHOLDER_DEFAULT_DECK,
  PLACEHOLDER_ITEMS,
  PLACEHOLDER_STARTER_LOADOUT,
  RULES_V07,
  aiSelect,
  deckCardIds,
  resolveEquipment,
  resolvePhase,
  startBattle,
  NO_EQUIPMENT,
  type CardDefinition,
  type SideState,
  type ChainStep,
  type PhaseResult,
  type SideResult,
} from "@gdr/engine";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AttackScene, afterDefense, calcSteps, playbackFrames, preOf, startOf } from "./Playback";

const card = (id: string, attack: number): CardDefinition =>
  ({ id, name: id, type: "heavy", attack, rarity: "N", skill: null }) as unknown as CardDefinition;
const cards = new Map(["L", "h1", "m1", "h2", "m2", "d1", "d2", "K"].map((id, i) => [id, card(id, 10 * (i + 1))]));

const pick = (c: string, counted: boolean): ChainStep => ({ card: c, from: "pick", counted });
const draw = (c: string, counted: boolean): ChainStep => ({ card: c, from: "draw", counted });
const side = (chain: ChainStep[]) => ({ chain, played: chain.filter((c) => c.counted).map((c) => c.card) }) as SideResult;

const result = {
  phase: 1,
  kind: "normal",
  winner: "challenger",
  damage: 10,
  damageTaken: { challenger: 0, defender: 10 },
  ignoredArmor: false,
  reshuffled: [],
  sides: {
    // Leader, two merges each drawing a card, two blockers, then the drawn cards resolve.
    challenger: side([
      pick("L", true),
      pick("h1", true),
      pick("m1", false),
      pick("h2", true),
      pick("m2", false),
      draw("d1", true),
      draw("d2", false),
    ]),
    defender: side([pick("K", true)]),
  },
} as unknown as PhaseResult;

describe("playbackFrames", () => {
  const frames = playbackFrames(result, cards);
  const row = (t: number) => frames[t]!.sides.challenger.row.map((c) => `${c.card}:${c.state}${c.fresh ? "*" : ""}`);

  it("resolves one card per beat and draws when a same-colour card merges", () => {
    expect(frames.map((f) => f.stage)).toEqual([...Array(7).fill("chain"), "total", "damage"]);
    expect(row(0)).toEqual(["L:leader", "h1:pending", "m1:pending", "h2:pending", "m2:pending"]);
    expect(row(1)).toEqual(["L:leader", "h1:counted", "m1:pending", "h2:pending", "m2:pending", "d1:pending*"]);
    expect(row(2)).toEqual(["L:leader", "h1:counted", "m1:blocked", "h2:pending", "m2:pending", "d1:pending"]);
    expect(row(3).at(-1)).toBe("d2:pending*");
    expect(row(6)).toEqual(["L:leader", "h1:counted", "m1:blocked", "h2:counted", "m2:blocked", "d1:counted", "d2:blocked"]);
  });

  it("keeps a running raw sum and holds the shorter side at its end", () => {
    expect(frames.map((f) => f.sides.challenger.sum)).toEqual([10, 30, 30, 70, 70, 130, 130, 130, 130]);
    expect(frames[6]!.sides.defender).toMatchObject({ sum: 80, counted: 1 });
    expect(frames[8]!.sides.challenger.row.some((c) => c.fresh)).toBe(false);
  });
});

describe("playbackFrames, rule 0.7.0-draft", () => {
  const more = new Map([...cards, ...["k1", "k2", "k3", "k4"].map((id) => [id, card(id, 1)] as const)]);
  const v07 = {
    ...result,
    sides: {
      // 4 charges (2 count, 2 block), then DRAW 2: one counts, one blocks.
      challenger: { ...result.sides.challenger, weaponAttack: 300 },
      // Every charge counts and nothing is drawn; its leader skill gets a beat.
      defender: {
        ...side([pick("K", true), pick("k1", true), pick("k2", true), pick("k3", true), pick("k4", true)]),
        weaponAttack: 500,
        skill: { id: "x", level: 1, blocked: false },
      },
    },
  } as unknown as PhaseResult;
  const frames = playbackFrames(v07, more, RULES_V07);
  const row = (t: number) => frames[t]!.sides.challenger.row.map((c) => `${c.card}:${c.state}${c.fresh ? "*" : ""}`);

  it("plays leader, skills, charges with their draws, drawn cards added, then the leader, both sides on the same beats", () => {
    expect(frames.map((f) => f.stage)).toEqual([...Array(9).fill("chain"), "total", "damage"]);
    expect(frames.map((f) => !!f.skills)).toEqual([false, true, ...Array(9).fill(false)]);
    expect(row(0)).toEqual(["L:leader", "h1:pending", "m1:pending", "h2:pending", "m2:pending"]);
    // A draw arrives on the beat a card joins the total, then waits in the queue for its own beat.
    expect(row(2)).toEqual(["L:leader", "h1:counted", "m1:pending", "h2:pending", "m2:pending", "d1:pending*"]);
    expect(row(3)).toEqual(["L:leader", "h1:counted", "m1:blocked", "h2:pending", "m2:pending", "d1:pending"]);
    expect(row(4).slice(-3)).toEqual(["m2:pending", "d1:pending", "d2:pending*"]);
    expect(row(5).slice(-3)).toEqual(["m2:blocked", "d1:pending", "d2:pending"]);
    expect(row(6).slice(-2)).toEqual(["d1:counted", "d2:pending"]);
    expect(row(7).slice(-2)).toEqual(["d1:counted", "d2:blocked"]);
    expect(row(8)[0]).toBe("L:leader*");
    expect(frames[10]!.sides.challenger.row.some((c) => c.fresh)).toBe(false);
  });

  it("counts up from the weapon and adds the leader last", () => {
    expect(frames.map((f) => f.sides.challenger.sum)).toEqual([300, 300, 320, 320, 360, 360, 420, 420, 430, 430, 430]);
    expect(frames.map((f) => f.sides.challenger.counted)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4]);
    expect(frames.map((f) => f.sides.defender.sum)).toEqual([500, 500, 501, 502, 503, 504, 504, 504, 584, 584, 584]);
    expect(frames[7]!.sides.defender.row.some((c) => c.fresh)).toBe(false);
  });

  it("ends on the engine's total for a real 0.7.0 phase", () => {
    const content = new Map(PLACEHOLDER_CARDS.map((c) => [c.id, c]));
    const equipment = resolveEquipment(PLACEHOLDER_STARTER_LOADOUT, new Map(PLACEHOLDER_ITEMS.map((i) => [i.id, i])));
    const deck = { deck: deckCardIds(PLACEHOLDER_DEFAULT_DECK), equipment };
    const state = startBattle([1, 2, 3, 4], deck, deck, RULES_V07);
    const { result: real } = resolvePhase(state, aiSelect(state.sides.challenger.hand, content, RULES_V07), content, RULES_V07);
    const end = playbackFrames(real, content, RULES_V07).at(-1)!;
    for (const id of ["challenger", "defender"] as const) {
      const s = real.sides[id];
      expect(end.sides[id]).toMatchObject({ sum: s.weaponAttack + s.baseAttack, counted: s.played.length });
      expect(end.sides[id].row.map((c) => c.card)).toEqual(s.chain.map((c) => c.card));
    }
  });
});

describe("calculation steps from skills", () => {
  // Real skill ids: 力量提升 (weapon +flat), 天秤 (element), 追加傷害 (final damage), 防護 (guard).
  const use = (id: string) => ({ id, level: 1, blocked: false });
  const sd = (o: Partial<SideResult>) =>
    ({ baseAttack: 100, weaponAttack: 50, combo: 1, advantage: false, advantageMultiplier: 1, attack: 150, defense: 0, skill: null, ...o }) as SideResult;
  const round = (a: Partial<SideResult>, b: Partial<SideResult>) =>
    ({ kind: "normal", sides: { challenger: sd(a), defender: sd(b) } }) as unknown as PhaseResult;

  it("shows a weapon-power change before the combo step, and nothing extra without one", () => {
    const r = round({ skill: use("power-up-1"), skillWeapon: 70, attack: 170 }, {});
    expect(startOf(r, "challenger")).toBe(150);
    const steps = calcSteps(r);
    expect(steps).toHaveLength(2);
    expect(steps[0]!.to.challenger).toBe(170);
    expect(steps[0]!.tag.challenger).toContain("武器 +20");
    expect(steps[0]!.tag.defender).toBe("");
    expect(steps[1]!.tag.challenger).toBe("COMBO ×1");
    expect(calcSteps(round({}, {}))).toHaveLength(1);
  });

  it("adds a colour step for 天秤 even though nobody's number changes", () => {
    const steps = calcSteps(round({ skill: use("balance-art") }, {}));
    expect(steps).toHaveLength(2);
    expect(steps[1]!.tag.challenger.length).toBeGreaterThan(0);
    expect(steps[1]!.tag.defender).toBe("");
  });

  it("adds a damage-skill step after the defense step only when the skill changed the damage", () => {
    const r = round({ attack: 300, skill: use("plus-damage-1") }, { attack: 100, defense: 50 });
    expect(afterDefense(r, "challenger", 100)).toBeNull(); // floor(200 × 50%) = 100
    const more = afterDefense(r, "challenger", 150)!;
    expect(more.from).toBe(100);
    expect(more.tag).toContain("+50");
    expect(afterDefense(round({ attack: 300 }, { attack: 100, skill: use("guard-1") }), "challenger", 0)!.tag).toContain("−200");
  });
});

describe("AttackScene inputs, rule 0.7.0-draft", () => {
  const content = new Map(PLACEHOLDER_CARDS.map((c) => [c.id, c]));
  const equipment = resolveEquipment(PLACEHOLDER_STARTER_LOADOUT, new Map(PLACEHOLDER_ITEMS.map((i) => [i.id, i])));
  const deck = { deck: deckCardIds(PLACEHOLDER_DEFAULT_DECK), equipment };
  const LONG = { ...RULES_V07, startingHp: 100_000 };
  const labels = { challenger: "我", defender: "敵" };
  const html = (r: PhaseResult) =>
    renderToStaticMarkup(
      createElement(AttackScene, { result: r, labels, hp: { challenger: 100_000, defender: 100_000 }, maxHp: 100_000, onHpShown: () => {}, onComplete: () => {} }),
    );

  it("a colour-advantage round steps from the combo total to the engine's attack", () => {
    let real: PhaseResult | undefined;
    for (let seed = 1; seed < 200 && !real; seed++) {
      const state = startBattle([seed, 2, 3, 4], deck, deck, LONG);
      const r = resolvePhase(state, aiSelect(state.sides.challenger.hand, content, LONG), content, LONG).result;
      if (r.kind === "normal" && (r.sides.challenger.advantage || r.sides.defender.advantage)) real = r;
    }
    expect(real).toBeDefined();
    for (const id of ["challenger", "defender"] as const) {
      const s = real!.sides[id];
      const start = Math.floor(preOf(real!, id) * s.combo); // what the scene shows before the 相剋 step
      expect(preOf(real!, id)).toBe(s.baseAttack + (s.skillWeapon ?? s.weaponAttack));
      if (s.advantage) {
        expect(s.advantageMultiplier).toBeGreaterThan(1);
        expect(s.attack).toBeGreaterThan(start); // the step really changes the number
      }
    }
    expect(html(real!)).toContain(`${real!.sides.challenger.baseAttack + (real!.sides.challenger.skillWeapon ?? real!.sides.challenger.weaponAttack)}`);
  });

  const runOut = (s: SideState): SideState => ({ ...s, drawPile: [], discard: s.drawPile, ranOut: true });
  const doubleOut = () => {
    const start = startBattle([9, 9, 9, 9], deck, deck, LONG);
    const sides = { challenger: runOut(start.sides.challenger), defender: runOut(start.sides.defender) };
    return resolvePhase({ ...start, kind: "deck_out", sides }, null, content, LONG).result;
  };

  it("a double final blow shows one loser's damage, not 雙方最終一擊", () => {
    const r = doubleOut();
    const out = html(r);
    expect(out).not.toContain("雙方最終一擊");
    expect(out).toContain("最終一擊");
    expect(out).toContain(`−${r.damage}`);
    expect(out.match(/scene-cut/g)).toHaveLength(1);
  });

  it("falls back to winner and damage when damageTaken is missing", () => {
    const old = { ...doubleOut(), kind: "normal", winner: "challenger", damage: 77, damageTaken: undefined } as unknown as PhaseResult;
    const out = html(old);
    expect(out).toContain("−77");
    expect(out).toContain("我的攻擊");
    expect(out.match(/scene-cut/g)).toHaveLength(1);
  });
});
