import { describe, expect, it } from "vitest";
import { omenOf } from "./gachaOmen";

describe("omenOf", () => {
  it("picks the highest rarity", () => {
    expect(omenOf(["N", "SR", "R"], () => 0.99)).toEqual({ best: "SR", start: "SR" });
    expect(omenOf([], () => 0)).toEqual({ best: "N", start: "N" });
  });
  it("SSR drops one tier below 0.5", () => {
    expect(omenOf(["SSR", "N"], () => 0.49)).toEqual({ best: "SSR", start: "SR" });
    expect(omenOf(["SSR", "N"], () => 0.5).start).toBe("SSR");
  });
  it("N, R and SR never tease", () => {
    expect(omenOf(["N", "R"], () => 0)).toEqual({ best: "R", start: "R" });
    expect(omenOf(["N"], () => 0).start).toBe("N");
    expect(omenOf(["N", "SR"], () => 0)).toEqual({ best: "SR", start: "SR" });
  });
});
