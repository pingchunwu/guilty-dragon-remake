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
  SSR_PITY,
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

  it("levels up once per duplicate, then keeps shards at the cap", () => {
    let collection = applyPull({}, "a", 3).collection;
    for (const level of [2, 3]) {
      const applied = applyPull(collection, "a", 3);
      collection = applied.collection;
      expect(applied.result).toMatchObject({ isNew: false, level, shards: 0, leveledUp: true });
    }
    const capped = applyPull(collection, "a", 3);
    expect(capped.result).toMatchObject({ level: 3, shards: 1, leveledUp: false });
  });
});

describe("drawTen", () => {
  it("draws exactly ten deterministic results", () => {
    const a = drawTen({}, PLACEHOLDER_POOL, createRng([1, 2, 3, 4]));
    const b = drawTen({}, PLACEHOLDER_POOL, createRng([1, 2, 3, 4]));
    expect(a.results).toHaveLength(10);
    expect(a.results).toEqual(b.results);
  });

  it("caps each pulled ID at its own max level", () => {
    const pool = { id: "t", entries: [{ id: "x", weight: 1 }] };
    const { results } = drawTen({ x: { level: 1, shards: 0 } }, pool, createRng([1, 1, 1, 1]), () => 4);
    expect(results.map((r) => r.level)).toEqual([2, 3, 4, 4, 4, 4, 4, 4, 4, 4]);
    expect(results.at(-1)!.shards).toBe(7);
  });

  it("only draws positive-weight cards", () => {
    const pool = { id: "t", entries: [{ id: "x", weight: 0 }, { id: "y", weight: 3 }] };
    const { results } = drawTen({}, pool, createRng([7, 7, 7, 7]));
    expect(new Set(results.map((r) => r.id))).toEqual(new Set(["y"]));
  });
});

describe("drawTen guarantees", () => {
  const rarities = { n: "N", r: "R", sr: "SR", ssr: "SSR" } as const;
  const rarityOf = (id: string) => rarities[id as keyof typeof rarities];
  const pool = { id: "t", entries: [{ id: "n", weight: 1000 }, { id: "sr", weight: 1 }, { id: "ssr", weight: 1 }] };
  const onlyLow = { id: "t", entries: [{ id: "n", weight: 1 }, { id: "r", weight: 1 }] };
  const best = (id: string) => id === "sr" || id === "ssr";

  it("gives ten pulls with no SR or better an SR or better on the last one", () => {
    let floored = 0;
    for (let seed = 0; seed < 50; seed++) {
      const { results } = drawTen({}, pool, createRng([seed, 2, 3, 4]), undefined, { rarityOf, pity: 0 });
      expect(results.some((r) => best(r.id))).toBe(true);
      if (best(results[9]!.id) && !results.slice(0, 9).some((r) => best(r.id))) floored++;
    }
    expect(floored).toBeGreaterThan(0);
  });

  it("forces SSR on the pity pull, resets, and counts on from there", () => {
    const { results, pity } = drawTen({}, pool, createRng([1, 2, 3, 4]), undefined, { rarityOf, pity: SSR_PITY - 1 });
    expect(results[0]!.id).toBe("ssr");
    // Nine more pulls, unless one of them was another SSR.
    expect(pity).toBeLessThanOrEqual(9);
    const lastSsr = results.map((r) => r.id).lastIndexOf("ssr");
    expect(pity).toBe(9 - lastSsr);
  });

  it("counts pulls without an SSR", () => {
    expect(drawTen({}, onlyLow, createRng([1, 2, 3, 4]), undefined, { rarityOf, pity: 5 }).pity).toBe(15);
  });

  it("draws normally when the pool has no guaranteed rarity", () => {
    const { results } = drawTen({}, onlyLow, createRng([1, 2, 3, 4]), undefined, { rarityOf, pity: SSR_PITY - 1 });
    expect(results).toHaveLength(10);
  });

  it("leaves draws without a guarantee alone", () => {
    const plain = drawTen({}, pool, createRng([1, 2, 3, 4]));
    expect(plain.pity).toBe(0);
    expect(plain.results.every((r) => r.id === "n")).toBe(true);
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
