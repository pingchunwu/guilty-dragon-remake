import { describe, expect, it } from "vitest";
import type { CardDefinition, Rarity } from "@gdr/engine";
import { DEFAULT_CARD_QUERY, queryCards, type CardQuery } from "./cardQuery";

const card = (id: string, rarity: Rarity, attack: number, draw: number): CardDefinition => ({
  id,
  name: id,
  type: "heavy",
  attack,
  draw,
  rarity,
  skill: null,
});
const NOW = Date.parse("2026-11-04T00:00:00Z");
const cards = [card("n", "N", 1500, 2), card("ur", "UR", 500, 1), card("sr", "SR", 1000, 3), card("sr2", "SR", 1000, 2)];
const owned = {
  n: { level: 1, shards: 0, obtainedAt: "2026-11-03T00:00:00Z" },
  ur: { level: 1, shards: 0, obtainedAt: "2026-10-01T00:00:00Z" },
  sr: { level: 1, shards: 0, obtainedAt: "2026-10-20T00:00:00Z" },
  sr2: { level: 1, shards: 0 },
};
const ids = (q: Partial<CardQuery>) => queryCards(cards, owned, { ...DEFAULT_CARD_QUERY, ...q }, NOW).map((c) => c.id);

describe("queryCards", () => {
  it("puts the highest rarity first by default, without touching the input", () => {
    expect(ids({})).toEqual(["ur", "sr", "sr2", "n"]);
    expect(cards[0]!.id).toBe("n");
  });

  it("sorts by attack, draw and time in either direction", () => {
    expect(ids({ sort: "attack" })).toEqual(["n", "sr", "sr2", "ur"]);
    expect(ids({ sort: "attack", descending: false })).toEqual(["ur", "sr", "sr2", "n"]);
    expect(ids({ sort: "draw" })).toEqual(["sr", "sr2", "n", "ur"]);
    expect(ids({ sort: "obtained" })).toEqual(["n", "sr", "ur", "sr2"]);
  });

  it("filters by rarity, attack, draw and time", () => {
    expect(ids({ rarity: "SR" })).toEqual(["sr", "sr2"]);
    expect(ids({ minAttack: 1000 })).toEqual(["sr", "sr2", "n"]);
    expect(ids({ draw: 2 })).toEqual(["sr2", "n"]);
    // A card with no known time is outside any time window.
    expect(ids({ obtainedDays: 30 })).toEqual(["sr", "n"]);
  });
});
