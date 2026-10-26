import { describe, expect, it } from "vitest";
import type { CardDefinition, ChainStep, PhaseResult, SideResult } from "@gdr/engine";
import { playbackFrames } from "./Playback";

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
