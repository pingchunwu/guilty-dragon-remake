import { describe, expect, it } from "vitest";
import {
  PLACEHOLDER_CARDS,
  PLACEHOLDER_DEFAULT_DECK,
  PLACEHOLDER_POOL,
  RULES_V0,
  applyPull,
  createRng,
  daysBetween,
  drawTen,
  taipeiDate,
  validateDeck,
} from "../src";

describe("placeholder content", () => {
  it("default deck is valid and fully owned by a new player", () => {
    const cards = new Map(PLACEHOLDER_CARDS.map((c) => [c.id, c]));
    expect(validateDeck(PLACEHOLDER_DEFAULT_DECK, cards, RULES_V0)).toEqual([]);
  });

  it("pool has more cards than one deck", () => {
    expect(PLACEHOLDER_POOL.entries.length).toBeGreaterThan(RULES_V0.deckSize);
  });
});

describe("applyPull", () => {
  it("adds a new card at level 1", () => {
    const { collection, result } = applyPull({}, "a");
    expect(collection).toEqual({ a: { level: 1, shards: 0 } });
    expect(result).toEqual({ id: "a", isNew: true, level: 1, shards: 0, leveledUp: false });
  });

  it("turns duplicates into shards and levels up at 5", () => {
    let collection = applyPull({}, "a").collection;
    for (let i = 1; i <= 4; i++) {
      const applied = applyPull(collection, "a");
      collection = applied.collection;
      expect(applied.result).toMatchObject({ isNew: false, level: 1, shards: i, leveledUp: false });
    }
    const fifth = applyPull(collection, "a");
    expect(fifth.result).toMatchObject({ level: 2, shards: 0, leveledUp: true });
  });
});

describe("drawTen", () => {
  it("draws exactly ten deterministic results", () => {
    const a = drawTen({}, PLACEHOLDER_POOL, createRng([1, 2, 3, 4]));
    const b = drawTen({}, PLACEHOLDER_POOL, createRng([1, 2, 3, 4]));
    expect(a.results).toHaveLength(10);
    expect(a.results).toEqual(b.results);
  });

  it("only draws positive-weight cards", () => {
    const pool = { id: "t", entries: [{ id: "x", weight: 0 }, { id: "y", weight: 3 }] };
    const { results } = drawTen({}, pool, createRng([7, 7, 7, 7]));
    expect(new Set(results.map((r) => r.id))).toEqual(new Set(["y"]));
  });
});

describe("Taipei dates", () => {
  it("rolls over at midnight Taipei time (16:00 UTC)", () => {
    expect(taipeiDate(new Date("2026-10-25T15:59:59Z"))).toBe("2026-10-25");
    expect(taipeiDate(new Date("2026-10-25T16:00:00Z"))).toBe("2026-10-26");
  });

  it("counts whole days between dates", () => {
    expect(daysBetween("2026-10-25", "2026-10-25")).toBe(0);
    expect(daysBetween("2026-10-25", "2026-10-28")).toBe(3);
    expect(daysBetween("2026-10-28", "2026-10-25")).toBe(0);
  });
});
