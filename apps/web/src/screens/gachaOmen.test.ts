import { describe, expect, it } from "vitest";
import { omenOf } from "./gachaOmen";

describe("omenOf", () => {
  it("N and R packs are not good", () => {
    expect(omenOf(["N", "R"])).toEqual({ good: false, tier: null });
    expect(omenOf([])).toEqual({ good: false, tier: null });
  });
  it("the best rarity in the pack sets the tier", () => {
    expect(omenOf(["N", "SR", "R"])).toEqual({ good: true, tier: "SR" });
    expect(omenOf(["SSR", "SR", "N"])).toEqual({ good: true, tier: "SSR" });
    expect(omenOf(["SSR", "UR", "N"])).toEqual({ good: true, tier: "UR" });
  });
});
